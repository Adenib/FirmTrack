import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('GET/PATCH /api/aitrack/inbox-digest-settings', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AiInboxDigestSettings')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/aitrack/inbox-digest-settings`)
    expect(res.status).toBe(401)
  })

  it('GET reports no mail access and disabled before any Microsoft connection', async () => {
    const res = await tenant.fetch('/api/aitrack/inbox-digest-settings')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasMailAccess).toBe(false)
    expect(body.enabled).toBe(false)
  })

  it('PATCH rejects without an active aitrack subscription', async () => {
    const res = await tenant.fetch('/api/aitrack/inbox-digest-settings', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/not active/i)
  })

  describe('with aitrack active', () => {
    beforeAll(async () => {
      await supabaseAdmin.from('subscriptions').insert({
        tenant_id: tenant.tenantId, module: 'aitrack', tier: 'free', is_active: true, price_per_user: 0,
      })
    })

    it('PATCH requires enabled to be a boolean', async () => {
      const res = await tenant.fetch('/api/aitrack/inbox-digest-settings', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: 'yes' }),
      })
      expect(res.status).toBe(400)
    })

    it('PATCH rejects turning it on without an existing Mail.Read connection', async () => {
      const res = await tenant.fetch('/api/aitrack/inbox-digest-settings', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/connect microsoft/i)
    })

    describe('with a Mail.Read Microsoft connection', () => {
      beforeAll(async () => {
        await supabaseAdmin.from('microsoft_graph_tokens').insert({
          user_id: tenant.userId,
          access_token: 'fake-access-token',
          refresh_token: 'fake-refresh-token',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          scope: 'Files.Read Mail.Read Sites.Read.All offline_access',
        })
      })

      it('GET now reports mail access', async () => {
        const res = await tenant.fetch('/api/aitrack/inbox-digest-settings')
        const body = await res.json()
        expect(body.hasMailAccess).toBe(true)
        expect(body.enabled).toBe(false)
      })

      it('PATCH can turn it on, and GET reflects it', async () => {
        const patchRes = await tenant.fetch('/api/aitrack/inbox-digest-settings', {
          method: 'PATCH',
          body: JSON.stringify({ enabled: true }),
        })
        expect(patchRes.status).toBe(200)
        expect((await patchRes.json()).enabled).toBe(true)

        const getRes = await tenant.fetch('/api/aitrack/inbox-digest-settings')
        expect((await getRes.json()).enabled).toBe(true)
      })

      it('PATCH can turn it back off', async () => {
        const patchRes = await tenant.fetch('/api/aitrack/inbox-digest-settings', {
          method: 'PATCH',
          body: JSON.stringify({ enabled: false }),
        })
        expect(patchRes.status).toBe(200)
        expect((await patchRes.json()).enabled).toBe(false)
      })
    })
  })
})
