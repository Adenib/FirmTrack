import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import * as otpauth from 'otpauth'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'
import { challengeAndVerifyWithRetry } from '@/lib/mfa-verify'

const TEST_PASSWORD = 'TestPassword123!'

function generateTotpCode(secret: string): string {
  return new otpauth.TOTP({
    secret: otpauth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate()
}

// A fresh anon-key client per call, never the shared supabaseAdmin
// singleton -- mirrors tests/admin/mfa.test.ts's anonClient(), for the
// same reason: each recovery/challenge sequence needs its own session.
function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

async function getRecoveryTokenHash(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })
  if (error || !data) throw new Error(`Could not generate recovery link: ${error?.message}`)
  return data.properties.hashed_token
}

// This reproduces the exact reported bug (reset-password showing "AAL2
// session is required to update email or password when MFA is enabled")
// and proves the fix: reset-password/page.tsx now runs an MFA challenge
// on the recovery session -- which elevates it to aal2 -- before calling
// updateUser(), instead of calling updateUser() straight off the aal1
// session a recovery link produces. Exercises the real Supabase Auth
// call sequence the page performs, not a mock of it.
describe('Password reset for an MFA-enrolled account', () => {
  let tenant: TestTenant
  let totpSecret: string

  beforeAll(async () => {
    tenant = await createTestTenant('ResetPasswordMfa')

    const client = anonClient()
    const { error: signInErr } = await client.auth.signInWithPassword({ email: tenant.email, password: TEST_PASSWORD })
    expect(signInErr).toBeNull()

    const { data: enrollData, error: enrollErr } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })
    expect(enrollErr).toBeNull()
    totpSecret = enrollData!.totp.secret

    const { error: verifyErr } = await challengeAndVerifyWithRetry(client, enrollData!.id, generateTotpCode(totpSecret))
    expect(verifyErr).toBeNull()
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('reproduces the reported bug: updateUser(password) on a bare aal1 recovery session is rejected', async () => {
    const tokenHash = await getRecoveryTokenHash(tenant.email)

    const recoveryClient = anonClient()
    const { error: verifyOtpErr } = await recoveryClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    expect(verifyOtpErr).toBeNull()

    const { error: updateErr } = await recoveryClient.auth.updateUser({ password: 'NewPassword456!' })
    expect(updateErr).not.toBeNull()
    expect(updateErr!.message).toMatch(/AAL2/i)
  })

  it('the fix: challenging the enrolled factor on the recovery session elevates it to aal2, and the password update then succeeds', async () => {
    const tokenHash = await getRecoveryTokenHash(tenant.email)

    const recoveryClient = anonClient()
    const { error: verifyOtpErr } = await recoveryClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    expect(verifyOtpErr).toBeNull()

    const { data: factorsData, error: factorsErr } = await recoveryClient.auth.mfa.listFactors()
    expect(factorsErr).toBeNull()
    const factorId = factorsData!.totp[0].id

    const { error: challengeErr } = await challengeAndVerifyWithRetry(recoveryClient, factorId, generateTotpCode(totpSecret))
    expect(challengeErr).toBeNull()

    const { data: aal } = await recoveryClient.auth.mfa.getAuthenticatorAssuranceLevel()
    expect(aal?.currentLevel).toBe('aal2')

    const { error: updateErr } = await recoveryClient.auth.updateUser({ password: 'NewPassword456!' })
    expect(updateErr).toBeNull()

    // The new password is real -- confirm a normal sign-in accepts it.
    const loginClient = anonClient()
    const { error: loginErr } = await loginClient.auth.signInWithPassword({ email: tenant.email, password: 'NewPassword456!' })
    expect(loginErr).toBeNull()
  })
})
