import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getExchangeRate, ExchangeRateError } from '@/lib/accounttrack/exchange-rate'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const tenantId = profile.tenant_id
  const { searchParams } = new URL(request.url)
  const asOf = searchParams.get('as_of') || new Date().toISOString().split('T')[0]
  const matterId = searchParams.get('matter_id')
  const displayCurrency = searchParams.get('currency')
  const yearStart = `${asOf.slice(0, 4)}-01-01`

  const { data: org } = await supabaseAdmin
    .from('organizations').select('base_currency').eq('id', tenantId).single()
  const baseCurrency = org?.base_currency || 'NGN'

  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id, key, code, name, account_type, currency')
    .eq('tenant_id', tenantId)
    .in('account_type', ['asset', 'liability', 'equity', 'revenue', 'expense'])
    .order('code')

  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 })
  const accountIds = (accounts || []).map((a) => a.id)

  const [balanceLinesRes, currentYearLinesRes] = await Promise.all([
    accountIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : (() => {
          let q = supabaseAdmin
            .from('journal_lines')
            .select('account_id, debit, credit, original_amount, matter_id, journal_entries!inner(entry_date, tenant_id)')
            .eq('tenant_id', tenantId)
            .in('account_id', accountIds)
            .lte('journal_entries.entry_date', asOf)
          if (matterId) q = q.eq('matter_id', matterId)
          return q
        })(),
    (() => {
      let q = supabaseAdmin
        .from('journal_lines')
        .select('account_id, debit, credit, matter_id, chart_of_accounts!inner(account_type, tenant_id), journal_entries!inner(entry_date, tenant_id)')
        .eq('tenant_id', tenantId)
        .in('chart_of_accounts.account_type', ['revenue', 'expense'])
        .gte('journal_entries.entry_date', yearStart)
        .lte('journal_entries.entry_date', asOf)
      if (matterId) q = q.eq('matter_id', matterId)
      return q
    })(),
  ])

  if (balanceLinesRes.error) return NextResponse.json({ error: balanceLinesRes.error.message }, { status: 500 })
  if (currentYearLinesRes.error) return NextResponse.json({ error: currentYearLinesRes.error.message }, { status: 500 })

  // Balance per account, up to as_of. Debit-normal (asset) accounts:
  // debit-credit. Credit-normal (liability/equity): credit-debit.
  const byAccount = new Map<string, number>()
  // Native-currency balance for accounts marked as genuinely foreign-currency
  // (chart_of_accounts.currency set) -- same raw signed convention as
  // revalue-fx-accounts.ts, built from the original_amount tagged on
  // transactions that actually moved money in/out of that account.
  const foreignByAccount = new Map<string, number>()
  for (const line of balanceLinesRes.data || []) {
    const current = byAccount.get(line.account_id) || 0
    byAccount.set(line.account_id, current + Number(line.debit || 0) - Number(line.credit || 0))
    if (line.original_amount !== null && line.original_amount !== undefined) {
      const signedOriginal = Number(line.debit || 0) > 0 ? Number(line.original_amount) : -Number(line.original_amount)
      foreignByAccount.set(line.account_id, (foreignByAccount.get(line.account_id) || 0) + signedOriginal)
    }
  }

  const assets = (accounts || [])
    .filter((a) => a.account_type === 'asset')
    .map((a) => ({
      ...a,
      amount: byAccount.get(a.id) || 0,
      foreign_balance: a.currency && a.currency !== baseCurrency ? (foreignByAccount.get(a.id) || 0) : null,
    }))
    .filter((a) => a.amount !== 0)

  const liabilities = (accounts || [])
    .filter((a) => a.account_type === 'liability')
    .map((a) => ({
      ...a,
      amount: -(byAccount.get(a.id) || 0),
      foreign_balance: a.currency && a.currency !== baseCurrency ? -(foreignByAccount.get(a.id) || 0) : null,
    }))
    .filter((a) => a.amount !== 0)

  const retainedEarningsAccount = (accounts || []).find((a) => a.key === 'retained_earnings')
  const retainedEarnings = retainedEarningsAccount
    ? -(byAccount.get(retainedEarningsAccount.id) || 0)
    : 0

  // Live current-year earnings: revenue credits - debits, minus expense
  // debits - credits, for entries dated within the year containing as_of.
  // Self-corrects once a year is closed — the closing entry's lines net
  // this to ~0 for that year automatically (see plan for why).
  let currentYearRevenue = 0
  let currentYearExpense = 0
  for (const line of currentYearLinesRes.data || []) {
    const type = (line as unknown as { chart_of_accounts: { account_type: string } }).chart_of_accounts.account_type
    if (type === 'revenue') currentYearRevenue += Number(line.credit || 0) - Number(line.debit || 0)
    else currentYearExpense += Number(line.debit || 0) - Number(line.credit || 0)
  }
  const currentYearEarnings = currentYearRevenue - currentYearExpense

  let totalAssets = assets.reduce((sum, a) => sum + a.amount, 0)
  let totalLiabilities = liabilities.reduce((sum, a) => sum + a.amount, 0)
  let displayedRetainedEarnings = retainedEarnings
  let displayedCurrentYearEarnings = currentYearEarnings
  let totalEquity = retainedEarnings + currentYearEarnings

  // Whole-statement translation at a single current rate, for quick
  // reference -- NOT per-line historical-rate conversion (that's the real
  // GL/revaluation accounting above). Native foreign_balance figures on
  // individual accounts are left untranslated (already in their own currency).
  let displayRate: number | null = null
  if (displayCurrency && displayCurrency !== baseCurrency) {
    try {
      displayRate = await getExchangeRate(tenantId, baseCurrency, displayCurrency, asOf)
    } catch (err) {
      if (err instanceof ExchangeRateError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }
    const r = displayRate
    assets.forEach((a) => { a.amount *= r })
    liabilities.forEach((a) => { a.amount *= r })
    displayedRetainedEarnings *= r
    displayedCurrentYearEarnings *= r
    totalAssets *= r
    totalLiabilities *= r
    totalEquity *= r
  }

  return NextResponse.json({
    as_of: asOf,
    assets,
    liabilities,
    equity: {
      retained_earnings: displayedRetainedEarnings,
      current_year_earnings: displayedCurrentYearEarnings,
    },
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquity,
    base_currency: baseCurrency,
    display_currency: displayCurrency && displayCurrency !== baseCurrency ? displayCurrency : null,
    display_rate: displayRate,
    balances: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  })
}
