import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createPayrollRun, postPayrollRun, PayrollError, type Deduction } from '@/lib/hrtrack/payroll'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAYROLL_PRIVILEGED = ['owner', 'admin']

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// Runs (and their line items) are owner/admin-only, unlike Requests --
// an individual line item's own employee sees their pay via
// /api/hrtrack/payroll/my-payslips instead, not this route.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile || !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const runId = searchParams.get('id')

  let runsQuery = supabaseAdmin
    .from('payroll_runs')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('period_start', { ascending: false })
  if (runId) runsQuery = runsQuery.eq('id', runId)

  const { data: runs, error: runsError } = await runsQuery
  if (runsError) return NextResponse.json({ error: runsError.message }, { status: 500 })

  const runIds = (runs || []).map((r) => r.id)
  const { data: lineItems } = runIds.length > 0
    ? await supabaseAdmin
        .from('payroll_line_items')
        .select('*, users(email)')
        .eq('tenant_id', profile.tenant_id)
        .in('payroll_run_id', runIds)
    : { data: [] }

  return NextResponse.json({ runs, lineItems: lineItems || [] })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile || !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { period_start, period_end, pay_date } = await request.json()
  if (!period_start || !period_end || !pay_date) {
    return NextResponse.json({ error: 'period_start, period_end, and pay_date are required' }, { status: 400 })
  }
  if (period_end < period_start) {
    return NextResponse.json({ error: 'period_end must be on or after period_start' }, { status: 400 })
  }

  try {
    const { run, lineItems } = await createPayrollRun({
      tenantId: profile.tenant_id,
      periodStart: period_start,
      periodEnd: period_end,
      payDate: pay_date,
      createdBy: user.id,
    })
    return NextResponse.json({ run, lineItems })
  } catch (err) {
    if (err instanceof PayrollError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

// action: 'update_deductions' (draft only, edits one line item's
// deductions) or 'post' (posts every line item to the ledger and closes
// the run — see postPayrollRun for the full posting/marking sequence).
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile || !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await request.json()
  const { id, action } = body as { id: string; action: string }
  if (!id || !['update_deductions', 'post'].includes(action)) {
    return NextResponse.json({ error: 'id and a valid action are required' }, { status: 400 })
  }

  if (action === 'post') {
    try {
      const run = await postPayrollRun({ tenantId: profile.tenant_id, runId: id, postedBy: user.id })
      return NextResponse.json({ run })
    } catch (err) {
      if (err instanceof PayrollError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }
  }

  const { lineItemId, deductions } = body as { lineItemId: string; deductions: Deduction[] }
  if (!lineItemId || !Array.isArray(deductions)) {
    return NextResponse.json({ error: 'lineItemId and a deductions array are required' }, { status: 400 })
  }

  const { data: run } = await supabaseAdmin
    .from('payroll_runs')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.status !== 'draft') {
    return NextResponse.json({ error: 'Only a draft run\'s deductions can be edited' }, { status: 400 })
  }

  const { data: lineItem, error } = await supabaseAdmin
    .from('payroll_line_items')
    .update({ deductions })
    .eq('id', lineItemId)
    .eq('payroll_run_id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lineItem })
}

// Discards a draft run (and its line items, via on delete cascade) --
// safe with no side effects to unwind since leave requests are only
// marked paid at POST time, never at draft creation.
export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile || !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: run } = await supabaseAdmin
    .from('payroll_runs')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.status !== 'draft') {
    return NextResponse.json({ error: 'Only a draft run can be deleted' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('payroll_runs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
