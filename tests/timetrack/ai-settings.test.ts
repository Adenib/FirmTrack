import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, type TestTenant } from '../helpers/test-client'

describe('TimeTrack AI-drafting settings', () => {
  let tenant: TestTenant
  let staff: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AiSettingsTenant')
    staff = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('requires authentication to read', async () => {
    const res = await fetch('http://localhost:3000/api/timetrack/settings')
    expect(res.status).toBe(401)
  })

  it('defaults to disabled, and any tenant member (including staff) can read it', async () => {
    const ownerRes = await tenant.fetch('/api/timetrack/settings')
    expect(ownerRes.status).toBe(200)
    expect((await ownerRes.json()).settings).toEqual({ ai_drafting_enabled: false })

    const staffRes = await staff.fetch('/api/timetrack/settings')
    expect(staffRes.status).toBe(200)
    expect((await staffRes.json()).settings).toEqual({ ai_drafting_enabled: false })
  })

  it('only owner/admin can change it -- staff is rejected', async () => {
    const res = await staff.fetch('/api/timetrack/settings', {
      method: 'PUT',
      body: JSON.stringify({ ai_drafting_enabled: true }),
    })
    expect(res.status).toBe(403)
  })

  it('rejects a non-boolean value', async () => {
    const res = await tenant.fetch('/api/timetrack/settings', {
      method: 'PUT',
      body: JSON.stringify({ ai_drafting_enabled: 'yes' }),
    })
    expect(res.status).toBe(400)
  })

  it('owner can enable it, and the change is visible on a subsequent read', async () => {
    const putRes = await tenant.fetch('/api/timetrack/settings', {
      method: 'PUT',
      body: JSON.stringify({ ai_drafting_enabled: true }),
    })
    expect(putRes.status).toBe(200)
    expect((await putRes.json()).settings).toEqual({ ai_drafting_enabled: true })

    const getRes = await staff.fetch('/api/timetrack/settings')
    expect((await getRes.json()).settings).toEqual({ ai_drafting_enabled: true })

    // Turn it back off so this test is order-independent of the route test file.
    await tenant.fetch('/api/timetrack/settings', {
      method: 'PUT',
      body: JSON.stringify({ ai_drafting_enabled: false }),
    })
  })
})
