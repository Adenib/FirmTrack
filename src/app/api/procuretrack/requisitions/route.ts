import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'
import { matchApprovalRule, buildApprovalSteps, type ApprovalRule } from '@/lib/procuretrack/approval-rules'
import { logProcuretrackEvent } from '@/lib/procuretrack/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
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

  const isApprover = PROCURETRACK_APPROVER_ROLES.includes(profile.role)
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const mine = searchParams.get('mine') === 'true'

  let query = supabaseAdmin
    .from('procuretrack_requisitions')
    .select('*, requester:requested_by(email), department:department_id(name), approvals:procuretrack_approvals(*)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (mine || !isApprover) query = query.eq('requested_by', user.id)

  const { data: requisitions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requisitions, isApprover })
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

  const body = await request.json()
  const { department_id, catalog_item_id, item_description, quantity, unit_of_measure, reason } = body
  if (typeof item_description !== 'string' || !item_description.trim()) {
    return NextResponse.json({ error: 'item_description is required' }, { status: 400 })
  }
  const quantityNum = Number(quantity ?? 1)
  if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
  }

  let estimatedUnitCost = body.estimated_unit_cost != null ? Number(body.estimated_unit_cost) : null
  let unitOfMeasure = unit_of_measure || null

  if (catalog_item_id) {
    const { data: catalogItem } = await supabaseAdmin
      .from('procuretrack_catalog_items')
      .select('unit_price, unit_of_measure')
      .eq('id', catalog_item_id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!catalogItem) return NextResponse.json({ error: 'Unknown catalog_item_id' }, { status: 400 })
    if (estimatedUnitCost == null) estimatedUnitCost = catalogItem.unit_price != null ? Number(catalogItem.unit_price) : null
    if (!unitOfMeasure) unitOfMeasure = catalogItem.unit_of_measure
  }

  const estimatedTotalCost = estimatedUnitCost != null ? Math.round(estimatedUnitCost * quantityNum * 100) / 100 : null

  const { data: requisition, error } = await supabaseAdmin
    .from('procuretrack_requisitions')
    .insert({
      tenant_id: profile.tenant_id,
      requested_by: user.id,
      department_id: department_id || null,
      catalog_item_id: catalog_item_id || null,
      item_description: item_description.trim(),
      quantity: quantityNum,
      unit_of_measure: unitOfMeasure,
      estimated_unit_cost: estimatedUnitCost,
      estimated_total_cost: estimatedTotalCost,
      reason: reason || null,
      status: 'pending_approval',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Match a data-driven approval rule and generate the approval chain
  // right away -- a requisition always enters the approval queue on
  // creation, there's no separate "submit" step for v1. When no rule
  // matches at all, fall back to a single owner-approval step rather than
  // silently skipping approval and auto-approving spend.
  const { data: ruleRows } = await supabaseAdmin
    .from('procuretrack_approval_rules')
    .select('*')
    .eq('tenant_id', profile.tenant_id)

  const rules: ApprovalRule[] = (ruleRows || []).map((r) => ({
    id: r.id,
    minAmount: Number(r.min_amount),
    maxAmount: r.max_amount != null ? Number(r.max_amount) : null,
    departmentId: r.department_id,
    approverSequence: r.approver_sequence,
  }))

  const matched = matchApprovalRule(rules, {
    amount: estimatedTotalCost || 0,
    departmentId: department_id || null,
  })
  const steps = buildApprovalSteps(
    matched || { id: 'fallback', minAmount: 0, maxAmount: null, departmentId: null, approverSequence: [{ role: 'owner' }] }
  )

  await supabaseAdmin.from('procuretrack_approvals').insert(
    steps.map((s) => ({
      tenant_id: profile.tenant_id,
      requisition_id: requisition.id,
      sequence_no: s.sequenceNo,
      approver_role: s.approverRole,
    }))
  )

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'requisition', documentId: requisition.id,
    userId: user.id, eventType: 'submitted', metadata: { approval_steps: steps.length },
  })

  return NextResponse.json({ requisition }, { status: 201 })
}

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
  const { id } = body
  if (!id || body.status !== 'cancelled') {
    return NextResponse.json({ error: 'id is required and status must be "cancelled" (the only self-service update)' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('procuretrack_requisitions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  const isApprover = PROCURETRACK_APPROVER_ROLES.includes(profile.role)
  if (existing.requested_by !== user.id && !isApprover) {
    return NextResponse.json({ error: 'Not authorized to cancel this requisition' }, { status: 403 })
  }
  if (!['pending_approval', 'approved'].includes(existing.status)) {
    return NextResponse.json({ error: 'Only a pending or approved requisition can be cancelled' }, { status: 400 })
  }

  const { data: requisition, error } = await supabaseAdmin
    .from('procuretrack_requisitions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'requisition', documentId: id,
    userId: user.id, eventType: 'cancelled',
  })

  return NextResponse.json({ requisition })
}
