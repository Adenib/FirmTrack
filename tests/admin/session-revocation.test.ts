import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'
import { decodeJwtIssuedAt } from '@/lib/jwt'

const TEST_PASSWORD = 'TestPassword123!'

describe('decodeJwtIssuedAt', () => {
  it('decodes the iat claim from a real access token', async () => {
    const { data } = await supabaseAdmin.auth.admin.createUser({
      email: `jwt-decode-${Date.now()}@firmtrack-test.local`,
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    const before = Math.floor(Date.now() / 1000)
    // A throwaway client, not the shared supabaseAdmin singleton -- signing
    // in on that shared instance would switch its session context away
    // from the service-role key for every other test in this file that
    // reuses it afterward (RLS would then silently start filtering the
    // service-role queries below as if they were this throwaway user).
    const throwawayClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data: signIn } = await throwawayClient.auth.signInWithPassword({ email: data.user!.email!, password: TEST_PASSWORD })
    const iat = decodeJwtIssuedAt(signIn.session!.access_token)
    expect(iat).not.toBeNull()
    expect(iat!).toBeGreaterThanOrEqual(before - 5)
    expect(iat!).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 5)
    await supabaseAdmin.auth.admin.deleteUser(data.user!.id)
  })

  it('returns null for a malformed token', () => {
    expect(decodeJwtIssuedAt('not-a-jwt')).toBeNull()
    expect(decodeJwtIssuedAt('')).toBeNull()
  })
})

describe('Session revocation (API layer)', () => {
  let tenant: TestTenant
  let staff: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('SessionRevoke')
    staff = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('a non-owner/admin cannot revoke another user\'s sessions', async () => {
    const res = await staff.fetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: tenant.userId, revokeSessions: true }),
    })
    expect(res.status).toBe(403)
  })

  it('revoking sets sessions_revoked_at and logs session_revoked with the right actor/target', async () => {
    const revokeRes = await tenant.fetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: staff.userId, revokeSessions: true }),
    })
    expect(revokeRes.status).toBe(200)

    const { data: userRow } = await supabaseAdmin.from('users').select('id, sessions_revoked_at').eq('id', staff.userId).single()
    expect(userRow?.sessions_revoked_at).toBeTruthy()

    const { data: events } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .eq('event_type', 'session_revoked')
      .order('created_at', { ascending: false })
      .limit(1)
    expect(events?.[0]).toBeTruthy()
    expect(events?.[0].metadata.targetUserId).toBe(staff.userId)
    expect(events?.[0].user_id).toBe(tenant.userId)
    expect(events?.[0].email).toBe(staff.email)
  })

  it('a fresh login clears sessions_revoked_at', async () => {
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: staff.email, password: TEST_PASSWORD }),
    })
    expect(loginRes.status).toBe(200)

    const { data: userRow } = await supabaseAdmin.from('users').select('sessions_revoked_at').eq('id', staff.userId).single()
    expect(userRow?.sessions_revoked_at).toBeNull()
  })
})

// The actual enforcement -- an old session getting redirected to /login on
// its next page request once revoked -- lives in middleware.ts and is
// deliberately NOT asserted here. Confirmed via next dev that middleware's
// response header/redirect propagation for this path is unreliable in dev
// mode (the same next-dev-vs-next-start gap Stage 0's CSP work ran into);
// tested directly against a production build (next start) instead, where
// it behaves correctly. See the Stage 3 verification notes for that pass.
