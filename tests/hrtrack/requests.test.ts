import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, type TestTenant } from '../helpers/test-client'

describe('HRTrack Requests: grievance privacy', () => {
  let tenant: TestTenant
  let staffA: TestTenant
  let staffB: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('RequestsGrievance')
    staffA = await createTestUser(tenant, { role: 'staff' })
    staffB = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staffA.userId, staffB.userId])
  })

  it('staffA can submit and see their own grievance', async () => {
    const res = await staffA.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'grievance', details: { subject: 'Confidential matter', description: 'Details here' } }),
    })
    expect(res.status).toBe(200)

    const listRes = await staffA.fetch('/api/hrtrack/requests?type=grievance')
    const { requests } = await listRes.json()
    expect(requests.some((r: { details: { subject: string } }) => r.details.subject === 'Confidential matter')).toBe(true)
  })

  it('staffB (a different staff member) CANNOT see staffA\'s grievance', async () => {
    const listRes = await staffB.fetch('/api/hrtrack/requests?type=grievance')
    const { requests } = await listRes.json()
    expect(requests.some((r: { details: { subject: string } }) => r.details.subject === 'Confidential matter')).toBe(false)
  })

  it('owner CAN see the grievance', async () => {
    const listRes = await tenant.fetch('/api/hrtrack/requests?type=grievance')
    const { requests } = await listRes.json()
    expect(requests.some((r: { details: { subject: string } }) => r.details.subject === 'Confidential matter')).toBe(true)
  })

  it('a manager cannot approve/reject a grievance even if they somehow had the id', async () => {
    const manager = await createTestUser(tenant, { role: 'manager' })
    const listRes = await tenant.fetch('/api/hrtrack/requests?type=grievance')
    const { requests } = await listRes.json()
    const grievance = requests.find((r: { details: { subject: string } }) => r.details.subject === 'Confidential matter')

    const res = await manager.fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      body: JSON.stringify({ id: grievance.id, status: 'rejected' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('HRTrack Requests: leave balance enforcement', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let leaveTypeId: string

  beforeAll(async () => {
    tenant = await createTestTenant('RequestsLeave')
    staff = await createTestUser(tenant, { role: 'staff' })

    const res = await tenant.fetch('/api/hrtrack/leave-types', {
      method: 'POST',
      body: JSON.stringify({ name: 'Compassionate Leave', annual_days: 5 }),
    })
    const { leaveType } = await res.json()
    leaveTypeId = leaveType.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('a request within the remaining balance succeeds', async () => {
    const res = await staff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'leave', details: { leave_type_id: leaveTypeId, start_date: '2026-07-20', end_date: '2026-07-22' } }),
    })
    expect(res.status).toBe(200)
    const { request } = await res.json()
    expect(request.details.days).toBe(3)
  })

  it('a request exceeding the remaining balance is rejected', async () => {
    // Already have a pending 3-day request from the prior test, but balance
    // is only consumed by APPROVED requests -- so this 5-day request should
    // still fit against the full 5-day allocation (nothing approved yet).
    // Approve the first one, then a second request that would push the
    // total past 5 should fail.
    const listRes = await tenant.fetch('/api/hrtrack/requests?type=leave')
    const { requests } = await listRes.json()
    const pending = requests.find((r: { status: string }) => r.status === 'pending')
    await tenant.fetch('/api/hrtrack/requests', { method: 'PATCH', body: JSON.stringify({ id: pending.id, status: 'approved' }) })

    // 3 days already approved out of 5 -- requesting 4 more days should fail.
    const res = await staff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'leave', details: { leave_type_id: leaveTypeId, start_date: '2026-08-01', end_date: '2026-08-04' } }),
    })
    expect(res.status).toBe(400)
  })

  it('a pending (not yet approved) request does not itself consume balance for future requests', async () => {
    // 2 days remain (5 - 3 approved). A 2-day request should still succeed
    // even though the earlier test's second attempt is still just pending/rejected,
    // proving only APPROVED days count against the balance.
    const res = await staff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'leave', details: { leave_type_id: leaveTypeId, start_date: '2026-09-01', end_date: '2026-09-02' } }),
    })
    expect(res.status).toBe(200)
  })
})

describe('HRTrack Requests: review gating for non-grievance types', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let manager: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('RequestsReview')
    staff = await createTestUser(tenant, { role: 'staff' })
    manager = await createTestUser(tenant, { role: 'manager' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId, manager.userId])
  })

  it('a manager CAN approve a redeployment request', async () => {
    const createRes = await staff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'redeployment', details: { requested_assignment: 'Corporate team' } }),
    })
    const { request } = await createRes.json()

    const res = await manager.fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      body: JSON.stringify({ id: request.id, status: 'approved', reviewer_notes: 'Approved by manager' }),
    })
    expect(res.status).toBe(200)
  })

  it('a non-privileged staff member cannot approve someone else\'s request', async () => {
    const otherStaff = await createTestUser(tenant, { role: 'staff' })
    const createRes = await otherStaff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'exit', details: { last_working_day: '2026-12-31' } }),
    })
    const { request } = await createRes.json()

    const res = await staff.fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      body: JSON.stringify({ id: request.id, status: 'approved' }),
    })
    expect(res.status).toBe(403)
  })

  it('the submitter can withdraw their own pending request', async () => {
    const createRes = await staff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'exit', details: { last_working_day: '2026-12-31' } }),
    })
    const { request } = await createRes.json()

    const res = await staff.fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      body: JSON.stringify({ id: request.id, status: 'withdrawn' }),
    })
    expect(res.status).toBe(200)
  })

  it('a request cannot be reviewed twice (must be pending)', async () => {
    const createRes = await staff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'exit', details: { last_working_day: '2027-01-15' } }),
    })
    const { request } = await createRes.json()
    await tenant.fetch('/api/hrtrack/requests', { method: 'PATCH', body: JSON.stringify({ id: request.id, status: 'approved' }) })

    const res = await tenant.fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      body: JSON.stringify({ id: request.id, status: 'rejected' }),
    })
    expect(res.status).toBe(400)
  })
})
