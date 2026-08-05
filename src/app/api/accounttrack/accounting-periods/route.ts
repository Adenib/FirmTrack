import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { postJournalEntry, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'
import { revalueForeignCurrencyAccounts } from '@/lib/accounttrack/revalue-fx-accounts'
import { ExchangeRateError } from '@/lib/accounttrack/exchange-rate'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: periods, error } = await supabaseAdmin
    .from('accounting_periods')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('period_start', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ periods })
}

// Builds the year-end closing entry lines: one zeroing line per
// revenue/expense account with activity in the year, plus a single
// balancing line to retained_earnings for net income/loss. Closes
// directly to Retained Earnings (no intermediate Income Summary account),
// a reasonable simplification for a firm-level GL of this scope.
async function buildYearCloseLines(tenantId: string, periodStart: string, periodEnd: string) {
  const { data: accounts } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id, account_type')
    .eq('tenant_id', tenantId)
    .in('account_type', ['revenue', 'expense'])

  const accountIds = (accounts || []).map((a) => a.id)
  if (accountIds.length === 0) return { lines: [], netIncome: 0 }

  const { data: lines } = await supabaseAdmin
    .from('journal_lines')
    .select('account_id, debit, credit, journal_entries!inner(entry_date, tenant_id)')
    .eq('tenant_id', tenantId)
    .in('account_id', accountIds)
    .gte('journal_entries.entry_date', periodStart)
    .lte('journal_entries.entry_date', periodEnd)

  const byAccount = new Map<string, number>()
  for (const line of lines || []) {
    const current = byAccount.get(line.account_id) || 0
    byAccount.set(line.account_id, current + Number(line.credit || 0) - Number(line.debit || 0))
  }

  const closingLines: { accountId: string; debit?: number; credit?: number; description: string }[] = []
  let netIncome = 0

  for (const account of accounts || []) {
    const netCredit = byAccount.get(account.id) || 0
    if (netCredit === 0) continue
    netIncome += netCredit
    // Revenue accounts are credit-normal (netCredit > 0 typically) — zero
    // with a debit. Expense accounts are debit-normal (netCredit < 0
    // typically, since debits exceed credits) — zero with a credit.
    if (netCredit > 0) {
      closingLines.push({ accountId: account.id, debit: netCredit, description: 'Year-end close' })
    } else {
      closingLines.push({ accountId: account.id, credit: -netCredit, description: 'Year-end close' })
    }
  }

  return { lines: closingLines, netIncome }
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized — closing books requires owner or admin' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { period_type, period_start, period_end } = await request.json()
  if (!['month', 'year'].includes(period_type) || !period_start || !period_end) {
    return NextResponse.json({ error: "period_type ('month'|'year'), period_start, and period_end are required" }, { status: 400 })
  }

  let closingEntryId: string | null = null

  if (period_type === 'year') {
    const { lines, netIncome } = await buildYearCloseLines(profile.tenant_id, period_start, period_end)

    if (lines.length > 0) {
      const fullLines = [
        ...lines,
        netIncome > 0
          ? { accountKey: 'retained_earnings' as const, credit: netIncome, description: 'Year-end close: net income' }
          : { accountKey: 'retained_earnings' as const, debit: -netIncome, description: 'Year-end close: net loss' },
      ]

      try {
        closingEntryId = await postJournalEntry({
          tenantId: profile.tenant_id,
          entryDate: period_end,
          description: `Year-end close ${period_start} to ${period_end}`,
          sourceType: 'year_close',
          createdBy: user.id,
          lines: fullLines,
        })
      } catch (err) {
        if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
        throw err
      }
    }
  }

  // Revalue foreign-currency accounts (e.g. a real USD bank account) as of
  // the period end, for both month and year closes -- unlike the year-only
  // closing entry above, revaluation is date-based, not year-end-only.
  // Stored on its own accounting_periods.revaluation_entry_id column since
  // month closes never have a closing_entry_id to piggyback on.
  let revaluationEntryId: string | null = null
  try {
    const result = await revalueForeignCurrencyAccounts(profile.tenant_id, period_end, user.id, 'fx_revaluation_period_close')
    revaluationEntryId = result.entryId
  } catch (err) {
    if (err instanceof ExchangeRateError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  const { data: period, error } = await supabaseAdmin
    .from('accounting_periods')
    .insert({
      tenant_id: profile.tenant_id,
      period_type,
      period_start,
      period_end,
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      closing_entry_id: closingEntryId,
      revaluation_entry_id: revaluationEntryId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ period })
}

// Reopens a closed period. For a year with a closing entry, posts an exact
// reversal first (never mutates/deletes the original), then flips status.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized — reopening books requires owner or admin' }, { status: 403 })
  }

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: period } = await supabaseAdmin
    .from('accounting_periods')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 })
  if (period.status !== 'closed') return NextResponse.json({ error: 'Period is not closed' }, { status: 400 })

  // Flip to 'open' before posting the reversal, not after — the reversal
  // is dated at period_end (inside this period), and post_journal_entry
  // itself rejects any posting dated inside a still-'closed' period. Doing
  // this in the other order would deadlock: can't reverse the close while
  // it's still closed, can't mark it open without reversing first.
  const { data: updated, error } = await supabaseAdmin
    .from('accounting_periods')
    .update({ status: 'open' })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (period.closing_entry_id) {
    const { data: originalLines } = await supabaseAdmin
      .from('journal_lines')
      .select('account_id, matter_id, lawyer_id, debit, credit, description')
      .eq('journal_entry_id', period.closing_entry_id)

    try {
      await postJournalEntry({
        tenantId: profile.tenant_id,
        entryDate: period.period_end,
        description: `Reopen ${period.period_start} to ${period.period_end}`,
        sourceType: 'year_reopen',
        sourceId: period.closing_entry_id,
        createdBy: user.id,
        // Exact reversal: swap every line's debit/credit.
        lines: (originalLines || []).map((l) => ({
          accountId: l.account_id,
          matterId: l.matter_id,
          lawyerId: l.lawyer_id,
          debit: Number(l.credit || 0),
          credit: Number(l.debit || 0),
          description: l.description || 'Reopen reversal',
        })),
      })
    } catch (err) {
      // Period is already open at this point (status update above
      // succeeded) even though the reversal failed — same non-atomicity
      // tradeoff the rest of this codebase's multi-step writes accept.
      if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }
  }

  // Mirrors the closing_entry_id reversal above, independently -- a year
  // period can have both a closing entry and a revaluation entry, and both
  // need reversing on reopen.
  if (period.revaluation_entry_id) {
    const { data: revaluationLines } = await supabaseAdmin
      .from('journal_lines')
      .select('account_id, matter_id, lawyer_id, debit, credit, description')
      .eq('journal_entry_id', period.revaluation_entry_id)

    try {
      await postJournalEntry({
        tenantId: profile.tenant_id,
        entryDate: period.period_end,
        description: `Reopen ${period.period_start} to ${period.period_end}: reverse FX revaluation`,
        sourceType: 'fx_revaluation_reopen',
        sourceId: period.revaluation_entry_id,
        createdBy: user.id,
        lines: (revaluationLines || []).map((l) => ({
          accountId: l.account_id,
          matterId: l.matter_id,
          lawyerId: l.lawyer_id,
          debit: Number(l.credit || 0),
          credit: Number(l.debit || 0),
          description: l.description || 'Reopen reversal',
        })),
      })
    } catch (err) {
      if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }
  }

  return NextResponse.json({ period: updated })
}
