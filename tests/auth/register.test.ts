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
})
