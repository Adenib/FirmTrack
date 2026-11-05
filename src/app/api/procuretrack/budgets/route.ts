import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { computeBudgetUsage } from '@/lib/procuretrack/budgets'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// Committed/actual are computed live, never stored -- same convention as
// AccountTrack's own budgets table. Committed = total_amount of every
// non-cancelled PO raised against the department within the period;
// actual = amount of every payment posted against an invoice for one of
// those POs within the period.
async function usageForBudget(tenantId: string, departmentId: string, periodStart: string, periodEnd: string, amount: number) {
  const { data: pos } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('id, total_amount')
    .eq('tenant_id', tenantId)
    .eq('department_id', departmentId)
    .neq('status', 'cancelled')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd)

  const poIds = (pos || []).map((p) => p.id)
  const openPoTotals = (pos || []).map((p) => Number(p.total_amount) || 0)

  let paidInvoiceTotals: number[] = []
  if (poIds.length > 0) {
    const { data: invoices } = await supabaseAdmin
      .from('procuretrack_invoices')
      .select('id')
      .in('po_id', poIds)
    const invoiceIds = (invoices || []).map((i) => i.id)

    if (invoiceIds.length > 0) {
      const { data: payments } = await supabaseAdmin
        .from('procuretrack_payments')
        .select('amount, paid_at')
        .in('invoice_id', invoiceIds)
        .gte('paid_at', periodStart)
        .lte('paid_at', periodEnd)
      paidInvoiceTotals = (payments || []).map((p) => Number(p.amount) || 0)
    }
  }

  return computeBudgetUsage(amount, openPoTotals, paidInvoiceTotals)
}

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const departmentId = searchParams.get('department_id')

  let query = supabaseAdmin
    .from('procuretrack_budgets')
    .select('*, department:department_id(name)')
    .eq('tenant_id', profile.tenant_id)
    .order('period_start', { ascending: false })
  if (departmentId) query = query.eq('department_id', departmentId)

  const { data: budgets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const withUsage = await Promise.all(
    (budgets || []).map(async (b) => ({
      ...b,
      usage: await usageForBudget(profile.tenant_id, b.department_id, b.period_start, b.period_end, Number(b.amount)),
    }))
  )

  return NextResponse.json({ budgets: withUsage })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { department_id, period_start, period_end, amount, currency } = body
  if (!department_id || !period_start || !period_end) {
    return NextResponse.json({ error: 'department_id, period_start, and period_end are required' }, { status: 400 })
  }
  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const { data: budget, error } = await supabaseAdmin
    .from('procuretrack_budgets')
    .insert({
      tenant_id: profile.tenant_id,
      department_id,
      period_start,
      period_end,
      amount: amountNum,
      currency: currency || 'NGN',
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ budget }, { status: 201 })
}
