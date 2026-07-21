import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import * as otpauth from 'otpauth'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'
import { challengeAndVerifyWithRetry } from '@/lib/mfa-verify'

const TEST_PASSWORD = 'TestPassword123!'
const APP_URL = 'http://localhost:3000'

function generateTotpCode(secret: string): string {
  return new otpauth.TOTP({
    secret: otpauth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate()
}

// A fresh anon-key client, never the shared supabaseAdmin singleton (see
// the Stage 3 lesson in session-revocation.test.ts) -- each call gets its
// own session so enrolling/verifying one doesn't disturb another.
function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

// challengeAndVerifyWithRetry (src/lib/mfa-verify.ts, shared with the real
// /mfa/enroll and /mfa/challenge pages) retries once on Supabase's
// documented-but-flaky-under-concurrency mfa_ip_address_mismatch error --
// see that file for the full investigation. Using the same helper here
// exercises the exact code path production uses, rather than a
// test-only duplicate.

function extractCookieHeader(res: Response): string {
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : []
  return setCookies.map((c) => c.split(';')[0]).join('; ')
}

// A fresh cookie-based authenticated fetch, obtained by hitting the app's
// own login route directly -- needed here (rather than reusing
// tenant.fetch) because verifying a TOTP factor signs out a user's other
// sessions, which would silently invalidate any cookie session obtained
// before enrollment.
async function loginFetch(email: string, password: string): Promise<{ fetch: (path: string, init?: RequestInit) => Promise<Response>; mfaStep?: string }> {
  const res = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(body)}`)
  const cookieHeader = extractCookieHeader(res)
  return {
    mfaStep: body.mfaStep,
    fetch: (path: string, init: RequestInit = {}) =>
      fetch(`${APP_URL}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers || {}), cookie: cookieHeader },
      }),
  }
}

describe('MFA (TOTP)', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let ownerSecret: string
  let backupCodes: string[]

  beforeAll(async () => {
    tenant = await createTestTenant('MfaTenant')
    staff = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('backup codes are owner/admin only -- 403 for staff, 200 with codes for owner', async () => {
    const staffRes = await staff.fetch('/api/mfa/backup-codes', { method: 'POST' })
    expect(staffRes.status).toBe(403)

    const ownerRes = await tenant.fetch('/api/mfa/backup-codes', { method: 'POST' })
    expect(ownerRes.status).toBe(200)
    const ownerBody = await ownerRes.json()
    expect(Array.isArray(ownerBody.codes)).toBe(true)
    expect(ownerBody.codes.length).toBe(8)
    backupCodes = ownerBody.codes
  })

  it('enrolling a TOTP factor succeeds and a wrong code is rejected', async () => {
    const client = anonClient()
    const { error: signInErr } = await client.auth.signInWithPassword({ email: tenant.email, password: TEST_PASSWORD })
    expect(signInErr).toBeNull()

    const { data: enrollData, error: enrollErr } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })
    expect(enrollErr).toBeNull()
    ownerSecret = enrollData!.totp.secret

    const { error: wrongErr } = await client.auth.mfa.challengeAndVerify({ factorId: enrollData!.id, code: '000000' })
    expect(wrongErr).not.toBeNull()

    const { error: verifyErr } = await challengeAndVerifyWithRetry(client, enrollData!.id, generateTotpCode(ownerSecret))
    expect(verifyErr).toBeNull()
  })

  it('a subsequent login reports mfaStep "challenge", and completing it with a generated code succeeds', async () => {
    const { mfaStep } = await loginFetch(tenant.email, TEST_PASSWORD)
    expect(mfaStep).toBe('challenge')

    const client = anonClient()
    const { error: signInErr } = await client.auth.signInWithPassword({ email: tenant.email, password: TEST_PASSWORD })
    expect(signInErr).toBeNull()

    const { data: factorsData, error: factorsErr } = await client.auth.mfa.listFactors()
    expect(factorsErr).toBeNull()
    const factorId = factorsData!.totp[0].id

    const { error: verifyErr } = await challengeAndVerifyWithRetry(client, factorId, generateTotpCode(ownerSecret))
    expect(verifyErr).toBeNull()

    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    expect(aal?.currentLevel).toBe('aal2')
  })

  it('redeeming a valid backup code deletes the factor and logs mfa_reset; a used code cannot be reused', async () => {
    const { fetch: freshOwnerFetch } = await loginFetch(tenant.email, TEST_PASSWORD)
    const codeToRedeem = backupCodes[0]

    const redeemRes = await freshOwnerFetch('/api/mfa/backup-codes/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: codeToRedeem }),
    })
    expect(redeemRes.status).toBe(200)

    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: tenant.userId })
    expect(factors?.factors.length).toBe(0)

    const { data: events } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .eq('event_type', 'mfa_reset')
      .order('created_at', { ascending: false })
      .limit(1)
    expect(events?.[0]).toBeTruthy()
    expect(events?.[0].metadata.method).toBe('backup_code')
    expect(events?.[0].user_id).toBe(tenant.userId)

    const reuseRes = await freshOwnerFetch('/api/mfa/backup-codes/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: codeToRedeem }),
    })
    expect(reuseRes.status).toBe(400)
  })

  it('an admin-assisted reset deletes a staff member\'s factor and logs mfa_reset with the admin as actor', async () => {
    const staffClient = anonClient()
    const { error: signInErr } = await staffClient.auth.signInWithPassword({ email: staff.email, password: TEST_PASSWORD })
    expect(signInErr).toBeNull()

    const { data: enrollData, error: enrollErr } = await staffClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })
    expect(enrollErr).toBeNull()
    const { error: verifyErr } = await challengeAndVerifyWithRetry(staffClient, enrollData!.id, generateTotpCode(enrollData!.totp.secret))
    expect(verifyErr).toBeNull()

    const { fetch: adminFetch } = await loginFetch(tenant.email, TEST_PASSWORD)
    const resetRes = await adminFetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: staff.userId, resetMfa: true }),
    })
    expect(resetRes.status).toBe(200)

    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: staff.userId })
    expect(factors?.factors.length).toBe(0)

    const { data: events } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .eq('event_type', 'mfa_reset')
      .eq('metadata->>targetUserId', staff.userId)
      .order('created_at', { ascending: false })
      .limit(1)
    expect(events?.[0]).toBeTruthy()
    expect(events?.[0].metadata.method).toBe('admin')
    expect(events?.[0].user_id).toBe(tenant.userId)
  })
})
