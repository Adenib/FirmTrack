import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('MovementTrack bulk approvals', () => {
  let tenant: TestTenant
  let staffUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('MovementTrackBulk')
    staffUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication to log a movement', async () => {
    const res = await fetch(`${APP_URL}/api/movementtrack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location_to: 'Court' }),
    })
    expect(res.status).toBe(401)
  })

  it('lets any tenant user log their own movement', async () => {
    const res = await staffUser.fetch('/api/movementtrack', {
      method: 'POST',
      body: JSON.stringify({ location_to: 'Client site', purpose: 'Meeting' }),
    })
    expect(res.status).toBe(200)
  })

  it('does not let a non-privileged role change movement status', async () => {
    const createRes = await staffUser.fetch('/api/movementtrack', {
      method: 'POST',
      body: JSON.stringify({ location_to: 'Registry' }),
    })
    const { movement } = await createRes.json()

    const res = await staffUser.fetch('/api/movementtrack', {
      method: 'PATCH',
      body: JSON.stringify({ id: movement.id, status: 'approved' }),
    })
    expect(res.status).toBe(403)
  })

  it('bulk-approves several movements in one call, tenant-scoped', async () => {
    const created = await Promise.all(
      ['Court A', 'Court B', 'Court C'].map(async (dest) => {
        const res = await staffUser.fetch('/api/movementtrack', {
          method: 'POST',
          body: JSON.stringify({ location_to: dest }),
        })
        return (await res.json()).movement
      })
    )
    const ids = created.map((m) => m.id)

    const res = await tenant.fetch('/api/movementtrack', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status: 'approved' }),
    })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.movements).toHaveLength(3)
    expect(result.movements.every((m: { status: string }) => m.status === 'approved')).toBe(true)
  })

  it('rejects a PATCH with neither id nor ids', async () => {
    const res = await tenant.fetch('/api/movementtrack', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    expect(res.status).toBe(400)
  })

  it('a second tenant cannot bulk-approve the first tenant\'s movements', async () => {
    const otherTenant = await createTestTenant('MovementTrackBulkOther')
    try {
      const createRes = await tenant.fetch('/api/movementtrack', {
        method: 'POST',
        body: JSON.stringify({ location_to: 'Private office' }),
      })
      const { movement } = await createRes.json()

      const res = await otherTenant.fetch('/api/movementtrack', {
        method: 'PATCH',
        body: JSON.stringify({ ids: [movement.id], status: 'approved' }),
      })
      // Scoped update affects 0 rows rather than erroring -- the other
      // tenant's movement is simply untouched.
      expect(res.status).toBe(200)
      const result = await res.json()
      expect(result.movements).toHaveLength(0)
    } finally {
      await destroyTestTenant(otherTenant)
    }
  })
})
