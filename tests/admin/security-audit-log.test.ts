import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'
const TEST_PASSWORD = 'TestPassword123!'

async function latestEventFor(tenantId: string, eventType: string, email?: string) {
  let query = supabaseAdmin
    .from('security_audit_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })
    .limit(1)
  if (email) query = query.eq('email', email)
  const { data } = await query
  return data?.[0]
}

describe('Security audit log', () => {
  let tenant: TestTenant
  let staff: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AuditLog')
    staff = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('login_success is logged when a tenant is created (login happens as part of setup)', async () => {
    const event = await latestEventFor(tenant.tenantId, 'login_success', tenant.email)
    expect(event).toBeTruthy()
    expect(event.user_id).toBe(tenant.userId)
  })

  it('a wrong password logs login_failure without exposing why in the response', async () => {
    const res = await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: staff.email, password: 'wrong-password-entirely' }),
    })
    expect(res.status).toBe(401)

    const event = await latestEventFor(tenant.tenantId, 'login_failure', staff.email)
    expect(event).toBeTruthy()
    expect(event.user_id).toBe(staff.userId)
  })

  it('forgot-password logs password_reset_requested regardless of whether the email exists', async () => {
    const knownRes = await fetch(`${APP_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: staff.email }),
    })
    expect(knownRes.status).toBe(200)
    expect(await latestEventFor(tenant.tenantId, 'password_reset_requested', staff.email)).toBeTruthy()

    const unknownEmail = `nobody-${Date.now()}@firmtrack-test.local`
    const unknownRes = await fetch(`${APP_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: unknownEmail }),
    })
    expect(unknownRes.status).toBe(200)
    const { data: unknownEvents } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('event_type', 'password_reset_requested')
      .eq('email', unknownEmail)
    expect(unknownEvents?.length).toBe(1)
    expect(unknownEvents?.[0].tenant_id).toBeNull()
  })

  it('user_created logs correctly', async () => {
    const email = `test-created-${Date.now()}@firmtrack-test.local`
    const res = await tenant.fetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, role: 'staff', password: TEST_PASSWORD }),
    })
    expect(res.status).toBe(200)

    const event = await latestEventFor(tenant.tenantId, 'user_created', email)
    expect(event).toBeTruthy()
    expect(event.user_id).toBe(tenant.userId)
  })

  it('a non-owner/admin gets 403 on role change, deactivation, and the security log viewer', async () => {
    const roleRes = await staff.fetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: tenant.userId, role: 'admin' }),
    })
    expect(roleRes.status).toBe(403)

    const deactivateRes = await staff.fetch('/api/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ id: tenant.userId }),
    })
    expect(deactivateRes.status).toBe(403)

    const logRes = await staff.fetch('/api/admin/security-log')
    expect(logRes.status).toBe(403)
  })

  it('an admin cannot change their own role or the owner\'s role', async () => {
    const selfRes = await tenant.fetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: tenant.userId, role: 'staff' }),
    })
    expect(selfRes.status).toBe(400)
  })

  it('role change logs user_role_changed with from/to metadata', async () => {
    const res = await tenant.fetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: staff.userId, role: 'manager' }),
    })
    expect(res.status).toBe(200)

    const event = await latestEventFor(tenant.tenantId, 'user_role_changed', staff.email)
    expect(event).toBeTruthy()
    expect(event.metadata.from).toBe('staff')
    expect(event.metadata.to).toBe('manager')
  })

  it('an admin cannot deactivate themselves', async () => {
    const res = await tenant.fetch('/api/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ id: tenant.userId }),
    })
    expect(res.status).toBe(400)
  })

  it('deactivating a user logs it and blocks their next login; reactivating restores access', async () => {
    const deactivateRes = await tenant.fetch('/api/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ id: staff.userId }),
    })
    expect(deactivateRes.status).toBe(200)
    expect(await latestEventFor(tenant.tenantId, 'user_deactivated', staff.email)).toBeTruthy()

    const loginRes = await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: staff.email, password: TEST_PASSWORD }),
    })
    expect(loginRes.status).toBe(401)
    const body = await loginRes.json()
    expect(body.error).toMatch(/deactivated/i)

    const failureEvent = await latestEventFor(tenant.tenantId, 'login_failure', staff.email)
    expect(failureEvent.metadata.reason).toBe('deactivated')

    const reactivateRes = await tenant.fetch('/api/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ id: staff.userId, reactivate: true }),
    })
    expect(reactivateRes.status).toBe(200)
    expect(await latestEventFor(tenant.tenantId, 'user_reactivated', staff.email)).toBeTruthy()

    const secondLoginRes = await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: staff.email, password: TEST_PASSWORD }),
    })
    expect(secondLoginRes.status).toBe(200)
  })

  it('the security log viewer returns events and can filter by type', async () => {
    const allRes = await tenant.fetch('/api/admin/security-log')
    expect(allRes.status).toBe(200)
    const { events } = await allRes.json()
    expect(events.length).toBeGreaterThan(0)

    const filteredRes = await tenant.fetch('/api/admin/security-log?event_type=user_created')
    const { events: filtered } = await filteredRes.json()
    expect(filtered.every((e: { event_type: string }) => e.event_type === 'user_created')).toBe(true)
  })

  // Last: signing staff out invalidates their session, so nothing after
  // this can keep using staff.fetch. Re-authenticates fresh rather than
  // reusing the cookie staff.fetch has held since the top of this file --
  // by this point in the suite that session has been through enough
  // sequential requests (each passing through middleware's getUser() call,
  // which can rotate the refresh token) that the originally-captured
  // cookie is no longer guaranteed to still be the live one.
  it('logout logs correctly', async () => {
    const loginRes = await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: staff.email, password: TEST_PASSWORD }),
    })
    const getSetCookie = (loginRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
    const cookieHeader = (typeof getSetCookie === 'function' ? getSetCookie.call(loginRes.headers) : [])
      .map((c) => c.split(';')[0]).join('; ')

    await fetch(`${APP_URL}/auth/signout`, { headers: { cookie: cookieHeader } })

    const event = await latestEventFor(tenant.tenantId, 'logout', staff.email)
    expect(event).toBeTruthy()
    expect(event.user_id).toBe(staff.userId)
  })
})
