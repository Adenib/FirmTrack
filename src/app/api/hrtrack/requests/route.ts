import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { countLeaveDays, computeLeaveBalance } from '@/lib/hrtrack/leave-balance'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REQUEST_TYPES = ['leave', 'redeployment', 'grievance', 'exit']
const REVIEW_PRIVILEGED = ['owner', 'admin', 'manager']
const GRIEVANCE_PRIVILEGED = ['owner', 'admin']

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// GET reads via the service-role client (like every other route in this
// app), which bypasses RLS entirely — so the grievance visibility rule
// enforced at the DB layer by the requests_select_scoped policy must be
// re-applied here in application code, or a non-owner/admin caller would
// see every tenant's grievances through this endpoint regardless of RLS.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  let query = supabaseAdmin
    .from('requests')
    .select('*, requester:user_id(email), reviewer:reviewed_by(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (type) query = query.eq('type', type)
  if (!GRIEVANCE_PRIVILEGED.includes(profile.role)) {
    query = query.or(`type.neq.grievance,user_id.eq.${user.id}`)
  }

  const { data: requests, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Caller's own remaining leave balance per configured leave type, for
  // the Leave tab's "X of Y days" summary.
  const { data: leaveTypes } = await supabaseAdmin
    .from('leave_types')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('name')

  const currentYear = new Date().getFullYear()
  const { data: myApprovedLeave } = await supabaseAdmin
    .from('requests')
    .select('details')
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)
    .eq('type', 'leave')
    .eq('status', 'approved')

  const leaveBalances = (leaveTypes || []).map((lt) => {
    const usedThisYear = (myApprovedLeave || []).filter((r) => {
      const d = r.details as { leave_type_id?: string; start_date?: string; days?: number }
      return d.leave_type_id === lt.id && d.start_date && new Date(d.start_date).getFullYear() === currentYear
    })
    const remaining = lt.unlimited ? null : computeLeaveBalance(
      Number(lt.annual_days),
      usedThisYear.map((r) => ({ days: Number((r.details as { days?: number }).days || 0) }))
    )
    return { leave_type_id: lt.id, name: lt.name, annual_days: Number(lt.annual_days), unlimited: lt.unlimited, remaining }
  })

  return NextResponse.json({ requests, leaveTypes: leaveTypes || [], leaveBalances })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { type, details } = await request.json()
  if (!REQUEST_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${REQUEST_TYPES.join(', ')}` }, { status: 400 })
  }

  const finalDetails: Record<string, unknown> = { ...details }

  if (type === 'leave') {
    const { leave_type_id, start_date, end_date, reason, relief_officer_id } = details || {}
    if (!leave_type_id || !start_date || !end_date) {
      return NextResponse.json({ error: 'leave_type_id, start_date, and end_date are required' }, { status: 400 })
    }
    const days = countLeaveDays(start_date, end_date)
    if (days <= 0) return NextResponse.json({ error: 'end_date must be on or after start_date' }, { status: 400 })

    const { data: leaveType } = await supabaseAdmin
      .from('leave_types')
      .select('annual_days, unlimited')
      .eq('id', leave_type_id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!leaveType) return NextResponse.json({ error: 'Unknown leave_type_id' }, { status: 400 })

    if (!leaveType.unlimited) {
      const currentYear = new Date(start_date).getFullYear()
      const { data: approvedThisYear } = await supabaseAdmin
        .from('requests')
        .select('details')
        .eq('tenant_id', profile.tenant_id)
        .eq('user_id', user.id)
        .eq('type', 'leave')
        .eq('status', 'approved')

      const usedThisYear = (approvedThisYear || []).filter((r) => {
        const d = r.details as { leave_type_id?: string; start_date?: string }
        return d.leave_type_id === leave_type_id && d.start_date && new Date(d.start_date).getFullYear() === currentYear
      })
      const remaining = computeLeaveBalance(
        Number(leaveType.annual_days),
        usedThisYear.map((r) => ({ days: Number((r.details as { days?: number }).days || 0) }))
      )
      if (days > remaining) {
        return NextResponse.json({ error: `This request (${days} days) exceeds your remaining balance (${remaining} days)` }, { status: 400 })
      }
    }

    finalDetails.days = days
    finalDetails.reason = reason || null
    finalDetails.relief_officer_id = relief_officer_id || null
  } else if (type === 'redeployment') {
    if (!details?.requested_assignment) {
      return NextResponse.json({ error: 'requested_assignment is required' }, { status: 400 })
    }
  } else if (type === 'grievance') {
    if (!details?.subject || !details?.description) {
      return NextResponse.json({ error: 'subject and description are required' }, { status: 400 })
    }
  } else if (type === 'exit') {
    if (!details?.last_working_day) {
      return NextResponse.json({ error: 'last_working_day is required' }, { status: 400 })
    }
  }

  const { data: newRequest, error } = await supabaseAdmin
    .from('requests')
    .insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      type,
      details: finalDetails,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: newRequest })
}

// Review action (approve/reject) or the submitter withdrawing their own
// still-pending request. Grievances require owner/admin specifically —
// the same asymmetry as their read visibility, since a 'manager' who
// can't even see a grievance obviously shouldn't be able to rule on one.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { id, status, reviewer_notes, leave_allowance_amount } = await request.json()
  if (!id || !['approved', 'rejected', 'withdrawn'].includes(status)) {
    return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('requests')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'Only a pending request can be reviewed or withdrawn' }, { status: 400 })
  }

  if (status === 'withdrawn') {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only withdraw your own request' }, { status: 403 })
    }
  } else {
    const requiredRoles = existing.type === 'grievance' ? GRIEVANCE_PRIVILEGED : REVIEW_PRIVILEGED
    if (!requiredRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Not authorized to review this request' }, { status: 403 })
    }
  }

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status !== 'withdrawn') {
    updates.reviewed_by = user.id
    updates.reviewer_notes = reviewer_notes || null
    updates.reviewed_at = new Date().toISOString()
  }
  // Allowance is only meaningful for an approved leave request -- the
  // reviewer enters it by hand since there's no payroll system to derive
  // it from yet, so it's just a record, not an actual disbursement.
  if (existing.type === 'leave' && status === 'approved') {
    updates.leave_allowance_amount = leave_allowance_amount != null && leave_allowance_amount !== ''
      ? Number(leave_allowance_amount)
      : null
  }

  const { data: updated, error } = await supabaseAdmin
    .from('requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: updated })
}
