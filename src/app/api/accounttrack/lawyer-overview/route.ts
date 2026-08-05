import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Deliberately sourced from time_entries, never journal_lines.lawyer_id —
// that column only covers disbursement postings (fees are recognized at
// invoice level, which can span multiple lawyers' time), so it would
// silently undercount revenue if used here. Batched the same anti-N+1 way
// as the Matter Register: fetch all active lawyers, then one .in() query
// each for time_entries and budgets, aggregate in JS.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const tenantId = profile.tenant_id
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo = now.toISOString().split('T')[0]
  const from = searchParams.get('from') || defaultFrom
  const to = searchParams.get('to') || defaultTo

  const { data: lawyers, error: lawyersError } = await supabaseAdmin
    .from('lawyers')
    .select('id, full_name, nickname, initials')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('nickname')

  if (lawyersError) return NextResponse.json({ error: lawyersError.message }, { status: 500 })

  const lawyerIds = (lawyers || []).map((l) => l.id)
  if (lawyerIds.length === 0) return NextResponse.json({ from, to, lawyers: [] })

  const [entriesRes, budgetsRes] = await Promise.all([
    supabaseAdmin
      .from('time_entries')
      .select('lawyer_id, hours, amount, billable, status')
      .eq('tenant_id', tenantId)
      .in('lawyer_id', lawyerIds)
      .gte('entry_date', from)
      .lte('entry_date', to),
    supabaseAdmin
      .from('budgets')
      .select('lawyer_id, period_start, period_end, target_hours, target_billable_hours, target_revenue')
      .eq('tenant_id', tenantId)
      .in('lawyer_id', lawyerIds)
      .lte('period_start', to)
      .gte('period_end', from),
  ])

  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 })
  if (budgetsRes.error) return NextResponse.json({ error: budgetsRes.error.message }, { status: 500 })

  const entriesByLawyer = new Map<string, typeof entriesRes.data>()
  for (const entry of entriesRes.data || []) {
    const list = entriesByLawyer.get(entry.lawyer_id)
    if (list) list.push(entry)
    else entriesByLawyer.set(entry.lawyer_id, [entry])
  }

  // A lawyer could have multiple overlapping budget rows across periods —
  // take the one whose period_start is latest (most specific/recent match).
  const budgetByLawyer = new Map<string, (typeof budgetsRes.data)[number]>()
  for (const budget of budgetsRes.data || []) {
    const existing = budgetByLawyer.get(budget.lawyer_id)
    if (!existing || budget.period_start > existing.period_start) {
      budgetByLawyer.set(budget.lawyer_id, budget)
    }
  }

  const results = (lawyers || []).map((lawyer) => {
    const entries = entriesByLawyer.get(lawyer.id) || []
    const billableHours = entries.filter((e) => e.billable).reduce((sum, e) => sum + Number(e.hours || 0), 0)
    const nonBillableHours = entries.filter((e) => !e.billable).reduce((sum, e) => sum + Number(e.hours || 0), 0)
    const revenue = entries.filter((e) => e.billable).reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const wip = entries
      .filter((e) => e.billable && ['draft', 'submitted'].includes(e.status))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)

    const budget = budgetByLawyer.get(lawyer.id) || null
    const totalHours = billableHours + nonBillableHours

    let utilization = null
    let utilizationBasis: 'budget' | 'logged_ratio' | null = null
    if (budget?.target_billable_hours) {
      utilization = billableHours / Number(budget.target_billable_hours)
      utilizationBasis = 'budget'
    } else if (totalHours > 0) {
      utilization = billableHours / totalHours
      utilizationBasis = 'logged_ratio'
    }

    return {
      lawyer,
      hours: { billable: billableHours, non_billable: nonBillableHours, total: totalHours },
      revenue,
      wip,
      budget,
      utilization,
      utilization_basis: utilizationBasis,
    }
  })

  return NextResponse.json({ from, to, lawyers: results })
}
