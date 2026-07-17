import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'
const TEST_PASSWORD = 'TestPassword123!'

async function attemptLogin(email: string, password: string) {
  return fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

async function requestPasswordReset(email: string) {
  return fetch(`${APP_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

describe('Rate limiting', () => {
  let tenant: TestTenant
  let lockoutTarget: TestTenant
  let otherUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('RateLimit')
    lockoutTarget = await createTestUser(tenant, { role: 'staff' })
    otherUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [lockoutTarget.userId, otherUser.userId])
  })

  it('locks out an account after 5 failed login attempts, even with the correct password on the 6th', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await attemptLogin(lockoutTarget.email, 'definitely-wrong-password')
      expect(res.status).toBe(401)
    }

    const lockedRes = await attemptLogin(lockoutTarget.email, TEST_PASSWORD)
    expect(lockedRes.status).toBe(429)
    const body = await lockedRes.json()
    expect(body.error).toMatch(/too many/i)

    const { data: rateLimitedEvents } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('email', lockoutTarget.email)
      .eq('event_type', 'login_failure')
      .order('created_at', { ascending: false })
      .limit(1)
    expect(rateLimitedEvents?.[0]?.metadata?.reason).toBe('rate_limited')
    expect(rateLimitedEvents?.[0]?.metadata?.scope).toBe('email')
  })

  it('a different account is unaffected by another account\'s lockout', async () => {
    const res = await attemptLogin(otherUser.email, TEST_PASSWORD)
    expect(res.status).toBe(200)
  })

  it('rate-limits password reset requests per email while still returning success (anti-enumeration preserved)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await requestPasswordReset(otherUser.email)
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    }

    const limitedRes = await requestPasswordReset(otherUser.email)
    expect(limitedRes.status).toBe(200)
    expect((await limitedRes.json()).success).toBe(true)

    const { data: events } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('email', otherUser.email)
      .eq('event_type', 'password_reset_requested')
      .order('created_at', { ascending: false })
      .limit(1)
    expect(events?.[0]?.metadata?.reason).toBe('rate_limited')
  })

  it('an unknown email requesting a reset is still logged and rate-limited the same way, response unchanged either way', async () => {
    const unknownEmail = `unknown-ratelimit-${Date.now()}@firmtrack-test.local`
    for (let i = 0; i < 3; i++) {
      const res = await requestPasswordReset(unknownEmail)
      expect(res.status).toBe(200)
    }
    const limitedRes = await requestPasswordReset(unknownEmail)
    expect(limitedRes.status).toBe(200)
    expect((await limitedRes.json()).success).toBe(true)

    const { data: events } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('email', unknownEmail)
      .eq('event_type', 'password_reset_requested')
    expect(events?.length).toBe(4)
    expect(events?.every((e) => e.tenant_id === null)).toBe(true)

    await supabaseAdmin.from('security_audit_log').delete().eq('email', unknownEmail)
  })
})
