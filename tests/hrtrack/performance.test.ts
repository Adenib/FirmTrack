import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, type TestTenant } from '../helpers/test-client'

describe('HRTrack Performance: task assignment + approval gate', () => {
  let tenant: TestTenant
  let staffUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('Performance')
    staffUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staffUser.userId])
  })

  it('creates a task assigned to a specific staff member', async () => {
    const res = await tenant.fetch('/api/tasktrack', {
      method: 'POST',
      body: JSON.stringify({ title: 'Draft pleadings', assigned_to: staffUser.userId }),
    })
    expect(res.status).toBe(200)
    const { task } = await res.json()
    expect(task.assigned_to).toBe(staffUser.userId)
  })

  it('a non-privileged user cannot approve a task out of "review"', async () => {
    const createRes = await tenant.fetch('/api/tasktrack', {
      method: 'POST',
      body: JSON.stringify({ title: 'Needs approval', assigned_to: staffUser.userId }),
    })
    const { task } = await createRes.json()

    // Move it into review first (any tenant member can do this).
    await staffUser.fetch('/api/tasktrack', {
      method: 'PATCH',
      body: JSON.stringify({ id: task.id, status: 'review' }),
    })

    const approveRes = await staffUser.fetch('/api/tasktrack', {
      method: 'PATCH',
      body: JSON.stringify({ id: task.id, status: 'done' }),
    })
    expect(approveRes.status).toBe(403)
  })

  it('owner/admin/manager CAN approve a task out of "review"', async () => {
    const createRes = await tenant.fetch('/api/tasktrack', {
      method: 'POST',
      body: JSON.stringify({ title: 'Approvable task', assigned_to: staffUser.userId }),
    })
    const { task } = await createRes.json()

    await tenant.fetch('/api/tasktrack', { method: 'PATCH', body: JSON.stringify({ id: task.id, status: 'review' }) })

    const approveRes = await tenant.fetch('/api/tasktrack', {
      method: 'PATCH',
      body: JSON.stringify({ id: task.id, status: 'done' }),
    })
    expect(approveRes.status).toBe(200)
    const { task: approved } = await approveRes.json()
    expect(approved.status).toBe('done')
  })

  it('direct open->done (no review step) does not require privilege', async () => {
    const createRes = await tenant.fetch('/api/tasktrack', {
      method: 'POST',
      body: JSON.stringify({ title: 'Simple self-closed task', assigned_to: staffUser.userId }),
    })
    const { task } = await createRes.json()

    const res = await staffUser.fetch('/api/tasktrack', {
      method: 'PATCH',
      body: JSON.stringify({ id: task.id, status: 'done' }),
    })
    expect(res.status).toBe(200)
  })
})

describe('HRTrack Performance: evaluations', () => {
  let tenant: TestTenant
  let staffUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('Evaluations')
    staffUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staffUser.userId])
  })

  it('rejects a non-privileged user creating an evaluation', async () => {
    const res = await staffUser.fetch('/api/hrtrack/evaluations', {
      method: 'POST',
      body: JSON.stringify({ staff_user_id: staffUser.userId, rating: 4 }),
    })
    expect(res.status).toBe(403)
  })

  it('owner can create and then list an evaluation for a staff member', async () => {
    const createRes = await tenant.fetch('/api/hrtrack/evaluations', {
      method: 'POST',
      body: JSON.stringify({ staff_user_id: staffUser.userId, period: 'Q3 2026', rating: 4, comments: 'Solid work' }),
    })
    expect(createRes.status).toBe(200)
    const { evaluation } = await createRes.json()
    expect(evaluation.rating).toBe(4)

    const listRes = await tenant.fetch(`/api/hrtrack/evaluations?staff_user_id=${staffUser.userId}`)
    expect(listRes.status).toBe(200)
    const { evaluations } = await listRes.json()
    expect(evaluations.some((e: { id: string }) => e.id === evaluation.id)).toBe(true)
    expect(evaluations[0].staff?.email).toBe(staffUser.email)
  })

  it('rejects a rating outside 1-5', async () => {
    const res = await tenant.fetch('/api/hrtrack/evaluations', {
      method: 'POST',
      body: JSON.stringify({ staff_user_id: staffUser.userId, rating: 7 }),
    })
    expect(res.status).toBe(400)
  })
})
