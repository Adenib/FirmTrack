import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, createTestUser, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('ProcureTrack requisitions + approval rules', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let manager: TestTenant
  let departmentId: string

  beforeAll(async () => {
    tenant = await createTestTenant('ProcureTrackReqApproval')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'procuretrack', tier: 'free', is_active: true, price_per_user: 0,
    })
    staff = await createTestUser(tenant, { role: 'staff' })
    manager = await createTestUser(tenant, { role: 'manager' })

    const deptRes = await tenant.fetch('/api/procuretrack/departments', {
      method: 'POST',
      body: JSON.stringify({ name: 'Operations' }),
    })
    departmentId = (await deptRes.json()).department.id

    // Bounded, so it doesn't tie with the unbounded high-value rule a
    // later test adds -- real approval-rule setups are non-overlapping
    // bands, same as the brief's own "under X -> manager; over X ->
    // manager then Finance" example.
    await tenant.fetch('/api/procuretrack/approval-rules', {
      method: 'POST',
      body: JSON.stringify({ min_amount: 0, max_amount: 5000000, department_id: null, approver_sequence: [{ role: 'manager' }] }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId, manager.userId])
  })

  it('rejects a module-inactive tenant', async () => {
    const otherTenant = await createTestTenant('ProcureTrackNoModule')
    const res = await otherTenant.fetch('/api/procuretrack/requisitions', {
      method: 'POST',
      body: JSON.stringify({ item_description: 'Laptop', quantity: 1 }),
    })
    expect(res.status).toBe(403)
    await destroyTestTenant(otherTenant)
  })

  let requisitionId: string

  it('any staff member can raise a requisition, which enters pending_approval with a generated approval chain', async () => {
    const res = await staff.fetch('/api/procuretrack/requisitions', {
      method: 'POST',
      body: JSON.stringify({
        department_id: departmentId, item_description: '5 new laptops', quantity: 5,
        estimated_unit_cost: 600000, reason: 'Replacing aging fleet',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    requisitionId = body.requisition.id
    expect(body.requisition.status).toBe('pending_approval')
    expect(body.requisition.estimated_total_cost).toBe(3000000)

    const { data: approvals } = await supabaseAdmin
      .from('procuretrack_approvals')
      .select('*')
      .eq('requisition_id', requisitionId)
      .order('sequence_no')
    expect(approvals).toHaveLength(1)
    expect(approvals![0].approver_role).toBe('manager')
    expect(approvals![0].status).toBe('pending')
  })

  it('the requisition is visible to the requester and to approver roles, but not to an unrelated staff member', async () => {
    const mineRes = await staff.fetch('/api/procuretrack/requisitions?mine=true')
    const mine = await mineRes.json()
    expect(mine.requisitions.some((r: { id: string }) => r.id === requisitionId)).toBe(true)

    const managerRes = await manager.fetch('/api/procuretrack/requisitions')
    const managerView = await managerRes.json()
    expect(managerView.requisitions.some((r: { id: string }) => r.id === requisitionId)).toBe(true)
  })

  it("the requester cannot approve their own requisition, even if they happen to hold the approver's role", async () => {
    // Promote the original requester to manager and have THEM try to
    // decide their own request's manager-level approval step.
    await supabaseAdmin.from('users').update({ role: 'manager' }).eq('id', staff.userId)

    const { data: approval } = await supabaseAdmin
      .from('procuretrack_approvals')
      .select('id')
      .eq('requisition_id', requisitionId)
      .single()

    const res = await staff.fetch('/api/procuretrack/approvals', {
      method: 'PATCH',
      body: JSON.stringify({ id: approval!.id, status: 'approved' }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/cannot approve or reject your own requisition/)

    await supabaseAdmin.from('users').update({ role: 'staff' }).eq('id', staff.userId)
  })

  it('a staff role (not matching the approver_role) cannot decide the step', async () => {
    const { data: approval } = await supabaseAdmin
      .from('procuretrack_approvals')
      .select('id')
      .eq('requisition_id', requisitionId)
      .single()

    const otherStaff = await createTestUser(tenant, { role: 'staff' })
    const res = await otherStaff.fetch('/api/procuretrack/approvals', {
      method: 'PATCH',
      body: JSON.stringify({ id: approval!.id, status: 'approved' }),
    })
    expect(res.status).toBe(403)
  })

  it('the manager (not the requester) can approve the step, which moves the requisition to approved', async () => {
    const { data: approval } = await supabaseAdmin
      .from('procuretrack_approvals')
      .select('id')
      .eq('requisition_id', requisitionId)
      .single()

    const res = await manager.fetch('/api/procuretrack/approvals', {
      method: 'PATCH',
      body: JSON.stringify({ id: approval!.id, status: 'approved', comments: 'Looks fine' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requisitionStatus).toBe('approved')

    const { data: requisition } = await supabaseAdmin
      .from('procuretrack_requisitions')
      .select('status')
      .eq('id', requisitionId)
      .single()
    expect(requisition!.status).toBe('approved')
  })

  it('an already-decided approval step cannot be decided again', async () => {
    const { data: approval } = await supabaseAdmin
      .from('procuretrack_approvals')
      .select('id')
      .eq('requisition_id', requisitionId)
      .single()

    const res = await manager.fetch('/api/procuretrack/approvals', {
      method: 'PATCH',
      body: JSON.stringify({ id: approval!.id, status: 'approved' }),
    })
    expect(res.status).toBe(400)
  })

  it('logs a procuretrack_audit_log row for the submission', async () => {
    const { data: events } = await supabaseAdmin
      .from('procuretrack_audit_log')
      .select('*')
      .eq('document_type', 'requisition')
      .eq('document_id', requisitionId)
      .eq('event_type', 'submitted')
    expect(events!.length).toBe(1)
  })

  it('a second-step chain enforces sequential order -- the later step cannot be decided before the earlier one', async () => {
    await tenant.fetch('/api/procuretrack/approval-rules', {
      method: 'POST',
      body: JSON.stringify({ min_amount: 10000000, max_amount: null, department_id: null, approver_sequence: [{ role: 'manager' }, { role: 'owner' }] }),
    })

    const bigReqRes = await staff.fetch('/api/procuretrack/requisitions', {
      method: 'POST',
      body: JSON.stringify({ item_description: 'Office renovation', quantity: 1, estimated_unit_cost: 20000000 }),
    })
    const bigReqId = (await bigReqRes.json()).requisition.id

    const { data: steps } = await supabaseAdmin
      .from('procuretrack_approvals')
      .select('*')
      .eq('requisition_id', bigReqId)
      .order('sequence_no')
    expect(steps).toHaveLength(2)

    const ownerStepRes = await tenant.fetch('/api/procuretrack/approvals', {
      method: 'PATCH',
      body: JSON.stringify({ id: steps![1].id, status: 'approved' }),
    })
    expect(ownerStepRes.status).toBe(400)
    expect((await ownerStepRes.json()).error).toMatch(/earlier approval step is still pending/)
  })
})
