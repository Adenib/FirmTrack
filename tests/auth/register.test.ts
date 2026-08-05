import { afterAll, describe, it, expect } from 'vitest'
import { supabaseAdmin } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'
const TEST_PASSWORD = 'TestPassword123!'

describe('POST /api/register -- User Agreement acceptance gate (Security Roadmap Stage 6)', () => {
  const createdUserIds: string[] = []
  const createdOrgIds: string[] = []

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await supabaseAdmin.from('security_audit_log').delete().eq('tenant_id', orgId)
      await supabaseAdmin.from('subscriptions').delete().eq('tenant_id', orgId)
      await supabaseAdmin.from('chart_of_accounts').delete().eq('tenant_id', orgId)
      await supabaseAdmin.from('leave_types').delete().eq('tenant_id', orgId)
      await supabaseAdmin.from('users').delete().eq('tenant_id', orgId)
      await supabaseAdmin.from('organizations').delete().eq('id', orgId)
    }
    for (const userId of createdUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
    }
  })

  it('rejects account creation when agreementAccepted is not true', async () => {
    const email = `register-gate-${Date.now()}@firmtrack-test.local`
    const { data: authUser } = await supabaseAdmin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true })
    createdUserIds.push(authUser!.user!.id)

    const res = await fetch(`${APP_URL}/api/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: authUser!.user!.id, email, orgName: 'No Agreement Org' }),
    })
    expect(res.status).toBe(400)

    const { data: profile } = await supabaseAdmin.from('users').select('id').eq('id', authUser!.user!.id).maybeSingle()
    expect(profile).toBeNull()
  })

  it('creates the account and logs terms_accepted when agreementAccepted is true', async () => {
    const email = `register-gate-ok-${Date.now()}@firmtrack-test.local`
    const { data: authUser } = await supabaseAdmin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true })
    createdUserIds.push(authUser!.user!.id)

    const res = await fetch(`${APP_URL}/api/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: authUser!.user!.id, email, orgName: 'Agreement Org', agreementAccepted: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    createdOrgIds.push(body.organizationId)

    const { data: events } = await supabaseAdmin
      .from('security_audit_log')
      .select('*')
      .eq('tenant_id', body.organizationId)
      .eq('event_type', 'terms_accepted')
      .order('created_at', { ascending: false })
      .limit(1)
    expect(events?.[0]).toBeTruthy()
    expect(events?.[0].user_id).toBe(authUser!.user!.id)
    expect(events?.[0].email).toBe(email)
    expect(events?.[0].metadata.version).toBe('v1')
  })

  it('defaults base_currency from the phone number\'s calling code, and NGN with no phone at all', async () => {
    const cases: Array<{ phone: string | undefined; expected: string }> = [
      { phone: '+234 801 234 5678', expected: 'NGN' },
      { phone: '+1 415 555 0100', expected: 'USD' },
      { phone: '+44 20 7946 0958', expected: 'GBP' },
      { phone: undefined, expected: 'NGN' },
    ]

    for (const { phone, expected } of cases) {
      const email = `register-currency-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@firmtrack-test.local`
      const { data: authUser } = await supabaseAdmin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true })
      createdUserIds.push(authUser!.user!.id)

      const res = await fetch(`${APP_URL}/api/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: authUser!.user!.id, email, orgName: `Currency Org ${expected}`, phone, agreementAccepted: true }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      createdOrgIds.push(body.organizationId)

      const { data: org } = await supabaseAdmin.from('organizations').select('base_currency, phone').eq('id', body.organizationId).single()
      expect(org?.base_currency).toBe(expected)
      expect(org?.phone).toBe(phone || null)
    }
  })
})
