import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { logProcuretrackEvent } from '@/lib/procuretrack/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// Approve/reject one step of a requisition's approval chain. Sequential,
// not parallel (the brief's "line manager, then Finance"): only the
// lowest-numbered still-pending step may be decided. Segregation of
// duty: the requisition's own requester can never decide a step on it,
// regardless of role match.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }

  const body = await request.json()
  const { id, status, comments } = body
  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'id and a valid status (approved|rejected) are required' }, { status: 400 })
  }

  const { data: approval } = await supabaseAdmin
    .from('procuretrack_approvals')
    .select('*, requisition:requisition_id(id, requested_by, status)')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!approval) return NextResponse.json({ error: 'Approval step not found' }, { status: 404 })

  const requisition = approval.requisition as { id: string; requested_by: string; status: string }

  if (requisition.requested_by === user.id) {
    return NextResponse.json({ error: 'You cannot approve or reject your own requisition' }, { status: 403 })
  }
  if (approval.approver_role !== profile.role) {
    return NextResponse.json({ error: `Only a ${approval.approver_role} may decide this step` }, { status: 403 })
  }
  if (approval.status !== 'pending') {
    return NextResponse.json({ error: 'This step has already been decided' }, { status: 400 })
  }

  const { data: allSteps } = await supabaseAdmin
    .from('procuretrack_approvals')
    .select('id, sequence_no, status')
    .eq('requisition_id', requisition.id)
    .order('sequence_no', { ascending: true })

  const lowestPending = (allSteps || []).find((s) => s.status === 'pending')
  if (lowestPending && lowestPending.id !== id) {
    return NextResponse.json({ error: 'An earlier approval step is still pending' }, { status: 400 })
  }

  const { data: updatedStep, error } = await supabaseAdmin
    .from('procuretrack_approvals')
    .update({ status, comments: comments || null, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let newRequisitionStatus: string | null = null
  if (status === 'rejected') {
    newRequisitionStatus = 'rejected'
  } else {
    const remainingSteps = (allSteps || []).filter((s) => s.id !== id)
    const allOthersApproved = remainingSteps.every((s) => s.status === 'approved')
    if (allOthersApproved) newRequisitionStatus = 'approved'
  }

  if (newRequisitionStatus) {
    await supabaseAdmin
      .from('procuretrack_requisitions')
      .update({ status: newRequisitionStatus, updated_at: new Date().toISOString() })
      .eq('id', requisition.id)
  }

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'requisition', documentId: requisition.id,
    userId: user.id, eventType: status === 'approved' ? 'approval_step_approved' : 'approval_step_rejected',
    metadata: { sequence_no: updatedStep.sequence_no, comments: comments || null },
  })

  return NextResponse.json({ approval: updatedStep, requisitionStatus: newRequisitionStatus })
}
