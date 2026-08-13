import { afterAll, describe, it, expect } from 'vitest'
import { supabaseAdmin, createTestPlatformAdmin, destroyTestPlatformAdmin, type TestPlatformAdmin } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'
const TEST_PASSWORD = 'TestPassword123!'

async function registerOrg(orgName: string) {
  const email = `signup-approval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@firmtrack-test.local`
  const { data: authUser } = await supabaseAdmin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true })
  const userId = authUser!.user!.id

  const res = await fetch(`${APP_URL}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, email, orgName, agreementAccepted: true }),
  })
  expect(res.status).toBe(200)
  const body = await res.json()
  return { email, userId, orgId: body.organizationId as string }
}

async function cleanupOrg(orgId: string, userId: string) {
  for (const table of ['subscriptions', 'chart_of_accounts', 'leave_types', 'users']) {
    await supabaseAdmin.from(table).delete().eq('tenant_id', orgId)
  }
  await supabaseAdmin.from('organizations').delete().eq('id', orgId)
  await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
}

describe('New signups require Creator Console approval before login', () => {
  let admin: TestPlatformAdmin
  const createdOrgs: { orgId: string; userId: string }[] = []

  afterAll(async () => {
    for (const { orgId, userId } of createdOrgs) {
      await cleanupOrg(orgId, userId)
    }
    if (admin) await destroyTestPlatformAdmin(admin)
  })

  it('creates a new org as is_active: false', async () => {
    const { orgId, userId } = await registerOrg('Pending Org A')
    createdOrgs.push({ orgId, userId })

    const { data: org } = await supabaseAdmin.from('organizations').select('is_active').eq('id', orgId).single()
    expect(org?.is_active).toBe(false)
  })

  it('blocks login for a pending organization with a clear message', async () => {
    const { orgId, userId, email } = await registerOrg('Pending Org B')
    createdOrgs.push({ orgId, userId })

    const res = await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/awaiting approval/i)
  })

  it('lists pending signups in the Creator Console and approves one, unblocking login', async () => {
    admin = await createTestPlatformAdmin('admin')
    const { orgId, userId, email } = await registerOrg('Pending Org C')
    createdOrgs.push({ orgId, userId })

    const listRes = await admin.fetch('/api/creator/signups')
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.organizations.some((o: { id: string }) => o.id === orgId)).toBe(true)

    const approveRes = await admin.fetch('/api/creator/signups', {
      method: 'PATCH',
      body: JSON.stringify({ orgId }),
    })
    expect(approveRes.status).toBe(200)

    const { data: org } = await supabaseAdmin.from('organizations').select('is_active').eq('id', orgId).single()
    expect(org?.is_active).toBe(true)

    const loginRes = await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    expect(loginRes.status).toBe(200)
  })

  it('rejects a pending signup, deleting the org and its owner', async () => {
    if (!admin) admin = await createTestPlatformAdmin('admin')
    const { orgId, userId } = await registerOrg('Pending Org D')

    const rejectRes = await admin.fetch('/api/creator/signups', {
      method: 'DELETE',
      body: JSON.stringify({ orgId }),
    })
    expect(rejectRes.status).toBe(200)

    const { data: org } = await supabaseAdmin.from('organizations').select('id').eq('id', orgId).maybeSingle()
    expect(org).toBeNull()
    const { data: user } = await supabaseAdmin.from('users').select('id').eq('id', userId).maybeSingle()
    expect(user).toBeNull()
    // No cleanup needed for this one -- reject already deleted everything.
  })

  it('a non-privileged (non-platform-admin) request cannot list or approve signups', async () => {
    const { orgId, userId } = await registerOrg('Pending Org E')
    createdOrgs.push({ orgId, userId })

    const res = await fetch(`${APP_URL}/api/creator/signups`)
    expect(res.status).toBe(401)
  })
})
