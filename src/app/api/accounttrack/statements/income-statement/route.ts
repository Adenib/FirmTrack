import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const matterId = searchParams.get('matter_id')

  if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })

  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id, code, name, account_type')
    .eq('tenant_id', tenantId)
    .in('account_type', ['revenue', 'expense'])
    .order('code')

  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 })
  const accountIds = (accounts || []).map((a) => a.id)

  if (accountIds.length === 0) {
    return NextResponse.json({ from, to, revenue: [], expense: [], total_revenue: 0, total_expense: 0, net_income: 0 })
  }

  let linesQuery = supabaseAdmin
    .from('journal_lines')
    .select('account_id, debit, credit, matter_id, journal_entries!inner(entry_date, tenant_id)')
    .eq('tenant_id', tenantId)
    .in('account_id', accountIds)
    .gte('journal_entries.entry_date', from)
    .lte('journal_entries.entry_date', to)

  if (matterId) linesQuery = linesQuery.eq('matter_id', matterId)

  const { data: lines, error: linesError } = await linesQuery
  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })

  const byAccount = new Map<string, number>()
  for (const line of lines || []) {
    const current = byAccount.get(line.account_id) || 0
    byAccount.set(line.account_id, current + Number(line.credit || 0) - Number(line.debit || 0))
  }

  const revenue = (accounts || [])
    .filter((a) => a.account_type === 'revenue')
    .map((a) => ({ ...a, amount: byAccount.get(a.id) || 0 }))
    .filter((a) => a.amount !== 0)

  const expense = (accounts || [])
    .filter((a) => a.account_type === 'expense')
    .map((a) => ({ ...a, amount: -(byAccount.get(a.id) || 0) }))
    .filter((a) => a.amount !== 0)

  const totalRevenue = revenue.reduce((sum, a) => sum + a.amount, 0)
  const totalExpense = expense.reduce((sum, a) => sum + a.amount, 0)

  return NextResponse.json({
    from,
    to,
    revenue,
    expense,
    total_revenue: totalRevenue,
    total_expense: totalExpense,
    net_income: totalRevenue - totalExpense,
  })
}
