import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET!

function runCron() {
  return fetch(`${APP_URL}/api/cron/aitrack-inbox-digest`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

describe('AITrack inbox digest cron', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AiInboxDigestCron')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'aitrack', tier: 'free', is_active: true, price_per_user: 0,
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects a request without the correct CRON_SECRET', async () => {
    const res = await fetch(`${APP_URL}/api/cron/aitrack-inbox-digest`, {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    expect(res.status).toBe(401)
  })

  // No real connected Microsoft 365 test account exists in this environment
  // (see the inbox digest plan's stated verification limits) -- this
  // confirms the cron's auth and querying logic runs end-to-end against
  // the real database and finds nobody opted in yet, not that a real
  // mailbox fetch or email send succeeds.
  it('runs successfully and finds no opted-in users before anyone has enabled the digest', async () => {
    const res = await runCron()
    expect(res.status).toBe(200)
    const summary = await res.json()
    expect(summary.ok).toBe(true)
    expect(typeof summary.usersChecked).toBe('number')
    expect(Array.isArray(summary.errors)).toBe(true)
  })

  it('picks up an opted-in user with a Mail.Read connection and attempts a digest (fails fast, since the fake token cannot refresh)', async () => {
    await supabaseAdmin.from('microsoft_graph_tokens').insert({
      user_id: tenant.userId,
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      // Already expired -- forces getValidGraphToken's refresh path, which
      // fails fast against the fake refresh_token (no real Azure app
      // credentials point at a real account in this environment), so the
      // cron records this as a per-user error rather than a successful send.
      expires_at: new Date(Date.now() - 3600_000).toISOString(),
      scope: 'Files.Read Mail.Read Sites.Read.All offline_access',
      ai_inbox_digest_enabled: true,
    })

    const res = await runCron()
    expect(res.status).toBe(200)
    const summary = await res.json()
    expect(summary.usersChecked).toBeGreaterThanOrEqual(1)
    // Either it correctly reported "no valid token," or the Azure refresh
    // call itself failed -- either way this user must show up as attempted,
    // never as a silent success.
    expect(summary.digestsSent).toBe(0)
    expect(summary.errors.length).toBeGreaterThanOrEqual(1)

    const { data: runs } = await supabaseAdmin
      .from('ai_inbox_digest_runs')
      .select('*')
      .eq('user_id', tenant.userId)
    expect(runs).toHaveLength(1)
    expect(runs![0].sent).toBe(false)
  })
})
