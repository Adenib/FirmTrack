import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestPlatformAdmin, destroyTestPlatformAdmin,
  supabaseAdmin, type TestTenant, type TestPlatformAdmin,
} from '../helpers/test-client'

describe('POST /api/creator/staff', () => {
  let actor: TestPlatformAdmin
  let orgOwnerTenant: TestTenant
  const extraPlatformAdminIds: string[] = []
  const extraAuthUserIds: string[] = []

  beforeAll(async () => {
    actor = await createTestPlatformAdmin('admin')
    orgOwnerTenant = await createTestTenant('CreatorStaffReuse')
  })

  afterAll(async () => {
    for (const id of extraPlatformAdminIds) {
      await supabaseAdmin.from('platform_admins').delete().eq('id', id)
    }
    for (const id of extraAuthUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {})
    }
    await destroyTestTenant(orgOwnerTenant)
    await destroyTestPlatformAdmin(actor)
  })

  it('reuses an existing tenant user\'s login instead of failing on "already registered"', async () => {
    const res = await actor.fetch('/api/creator/staff', {
      method: 'POST',
      body: JSON.stringify({
        email: orgOwnerTenant.email,
        full_name: 'Reused Org Owner',
        nickname: 'REUSED',
        cadre: 'developer',
      }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.staff.user_id).toBe(orgOwnerTenant.userId)
    expect(body.staff.role).toBe('developer')
    extraPlatformAdminIds.push(body.staff.id)
  })

  it('rejects adding the same person as platform staff twice', async () => {
    const res = await actor.fetch('/api/creator/staff', {
      method: 'POST',
      body: JSON.stringify({ email: orgOwnerTenant.email, cadre: 'accounts' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/already has Creator Console access/i)
  })

  it('requires a password only when the email has no existing login', async () => {
    const uniqueEmail = `test-new-staff-${Date.now()}@firmtrack-test.local`
    const noPasswordRes = await actor.fetch('/api/creator/staff', {
      method: 'POST',
      body: JSON.stringify({ email: uniqueEmail, cadre: 'developer' }),
    })
    expect(noPasswordRes.status).toBe(400)
    const noPasswordBody = await noPasswordRes.json()
    expect(noPasswordBody.error).toMatch(/password is required/i)

    const withPasswordRes = await actor.fetch('/api/creator/staff', {
      method: 'POST',
      body: JSON.stringify({ email: uniqueEmail, password: 'TestPassword123!', cadre: 'developer' }),
    })
    expect(withPasswordRes.status).toBe(200)
    const withPasswordBody = await withPasswordRes.json()
    expect(withPasswordBody.staff.email).toBe(uniqueEmail)
    extraPlatformAdminIds.push(withPasswordBody.staff.id)
    extraAuthUserIds.push(withPasswordBody.staff.user_id)
  })

  it('rejects a caller whose cadre lacks staff-page access (even one who is now platform staff themself)', async () => {
    const res = await orgOwnerTenant.fetch('/api/creator/staff', {
      method: 'POST',
      body: JSON.stringify({ email: 'irrelevant@firmtrack-test.local', password: 'x', cadre: 'developer' }),
    })
    expect(res.status).toBe(403)
  })
})
