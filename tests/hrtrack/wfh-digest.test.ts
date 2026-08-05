import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'
import { sendWfhDigestEmail } from '@/lib/hrtrack/send-wfh-digest-email'

const APP_URL = 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET!
const LAT = 6.5244
const LNG = 3.3792

function runCron() {
  return fetch(`${APP_URL}/api/cron/hrtrack-wfh-digest`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

describe('WFH end-of-day digest', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('WfhDigest')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'hrtrack', tier: 'basic', is_active: true, price_per_user: 0,
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('sendWfhDigestEmail sends to every owner/admin/hr user, not staff, via a stubbed transport', async () => {
    const admin = await createTestUser(tenant, { role: 'admin' })
    const hr = await createTestUser(tenant, { role: 'hr' })
    await createTestUser(tenant, { role: 'staff' })

    const calls: Array<{ to: string; subject: string }> = []
    await sendWfhDigestEmail(tenant.tenantId, '2026-08-05', [{ email: 'flagged@example.test', unconfirmedCount: 2 }], async (args) => {
      calls.push({ to: args.to, subject: args.subject })
    })

    const recipients = calls.map((c) => c.to).sort()
    expect(recipients).toContain(tenant.email) // tenant owner
    expect(recipients).toContain(admin.email)
    expect(recipients).toContain(hr.email)
    expect(recipients).toHaveLength(3)
    expect(calls[0].subject).toMatch(/1 employee probably not working/)
  })

  it('is a no-op when there are no flagged employees', async () => {
    const calls: Array<{ to: string }> = []
    await sendWfhDigestEmail(tenant.tenantId, '2026-08-05', [], async (args) => {
      calls.push({ to: args.to })
    })
    expect(calls).toHaveLength(0)
  })

  it('rejects a request without the correct CRON_SECRET', async () => {
    const res = await fetch(`${APP_URL}/api/cron/hrtrack-wfh-digest`, {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    expect(res.status).toBe(401)
  })

  it('collates today\'s unconfirmed WFH checks for a subscribed tenant and attempts a digest send', async () => {
    const staff = await createTestUser(tenant, { role: 'staff' })
    const clockInRes = await staff.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: LAT, lng: LNG, note: 'WFH for digest test' }),
    })
    const { record } = await clockInRes.json()

    const keyRes = await staff.fetch('/api/timetrack/agent-keys', { method: 'POST', body: JSON.stringify({ label: 'digest-test' }) })
    const { key } = await keyRes.json()

    const checkRes = await fetch(`${APP_URL}/api/hrtrack/wfh-checks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key.raw_key },
      body: JSON.stringify({ attendance_record_id: record.id }),
    })
    expect(checkRes.status).toBe(200)
    // Deliberately never confirmed -- this is the "no response" case.

    const cronRes = await runCron()
    expect(cronRes.status).toBe(200)
    const summary = await cronRes.json()
    expect(summary.tenantsChecked).toBeGreaterThanOrEqual(1)
    // Either the send succeeded, or it failed and was recorded as an error --
    // either way, the tenant with a flagged employee must have been attempted.
    expect(summary.digestsSent + summary.errors.length).toBeGreaterThanOrEqual(1)
  })
})
