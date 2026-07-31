import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  destroyTestTenant,
  createTestPlatformAdmin,
  destroyTestPlatformAdmin,
  supabaseAdmin,
  type TestTenant,
  type TestPlatformAdmin,
} from '../helpers/test-client'
import { MONTHLY_AI_MESSAGE_LIMIT } from '@/lib/ai/usage-limits'

describe('Support requests API', () => {
  let tenant: TestTenant
  let otherTenant: TestTenant
  let devAdmin: TestPlatformAdmin
  let supportAdmin: TestPlatformAdmin

  beforeAll(async () => {
    tenant = await createTestTenant('SupportTenant')
    otherTenant = await createTestTenant('SupportOtherTenant')
    devAdmin = await createTestPlatformAdmin('developer')
    supportAdmin = await createTestPlatformAdmin('admin')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
    await destroyTestTenant(otherTenant)
    await destroyTestPlatformAdmin(devAdmin)
    await destroyTestPlatformAdmin(supportAdmin)
  })

  it('requires authentication to create or list', async () => {
    const createRes = await fetch('http://localhost:3000/api/support/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'x', description: 'y', channel: 'standard' }),
    })
    expect(createRes.status).toBe(401)

    const listRes = await fetch('http://localhost:3000/api/support/requests')
    expect(listRes.status).toBe(401)
  })

  it('creates a standard-channel request (no subscription needed)', async () => {
    const res = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Cannot log in', description: 'Password reset link expired', channel: 'standard', severity: 'B' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.request.channel).toBe('standard')
    expect(body.request.severity).toBe('B')
    expect(body.request.status).toBe('open')
  })

  it('rejects an ai_assisted request when the firm has not subscribed to ai_support', async () => {
    const res = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'AI help please', description: 'x', channel: 'ai_assisted' }),
    })
    expect(res.status).toBe(403)
  })

  it('allows an ai_assisted request once ai_support is an active subscription', async () => {
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'ai_support', tier: 'basic', is_active: true, price_per_user: 2000,
    })

    const res = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'AI help please', description: 'x', channel: 'ai_assisted' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.request.channel).toBe('ai_assisted')

    // ANTHROPIC_API_KEY is genuinely configured in this environment (the
    // feature is live in production too), so this makes one real, tiny
    // paid API call -- a deliberate integration check, not mocked, to
    // confirm the whole chain (subscription gate -> AI call -> reply ->
    // usage logging) really works end-to-end, not just the gating logic.
    const msgRes = await tenant.fetch(`/api/support/requests/${body.request.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'How do I export a report?' }),
    })
    expect(msgRes.status).toBe(200)
    const msgBody = await msgRes.json()
    expect(msgBody.message.sender_type).toBe('ai')
    expect(msgBody.message.body.length).toBeGreaterThan(0)

    const { data: usageLogs } = await supabaseAdmin
      .from('ai_usage_log')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .eq('feature', 'support_chat')
    expect(usageLogs?.length).toBeGreaterThan(0)
    expect(usageLogs![0].input_tokens).toBeGreaterThan(0)
    expect(usageLogs![0].output_tokens).toBeGreaterThan(0)
  })

  it('rejects posting a message to a standard-channel request', async () => {
    const createRes = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Standard one', description: 'x', channel: 'standard' }),
    })
    const { request } = await createRes.json()

    const msgRes = await tenant.fetch(`/api/support/requests/${request.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'hello' }),
    })
    expect(msgRes.status).toBe(400)
  })

  it('scopes the history list to the requesting tenant only', async () => {
    const ownRes = await tenant.fetch('/api/support/requests')
    const ownBody = await ownRes.json()
    expect(ownBody.requests.length).toBeGreaterThan(0)

    const otherRes = await otherTenant.fetch('/api/support/requests')
    const otherBody = await otherRes.json()
    expect(otherBody.requests).toEqual([])
  })

  it('creator support access requires the right cadre', async () => {
    const unauthedRes = await fetch('http://localhost:3000/api/creator/support')
    expect(unauthedRes.status).toBe(401)

    const devRes = await devAdmin.fetch('/api/creator/support')
    expect(devRes.status).toBe(403)

    const supportRes = await supportAdmin.fetch('/api/creator/support')
    expect(supportRes.status).toBe(200)
    const body = await supportRes.json()
    expect(body.requests.some((r: { tenant_id: string }) => r.tenant_id === tenant.tenantId)).toBe(true)
  })

  it('rejects an AI Assistant message once the monthly per-tenant usage limit is reached', async () => {
    const createRes = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Quota test', description: 'x', channel: 'ai_assisted' }),
    })
    const { request } = await createRes.json()

    // Simulate having already hit the monthly cap -- directly inserting
    // MONTHLY_AI_MESSAGE_LIMIT synthetic 'user' messages this month is
    // the only practical way to test this without MONTHLY_AI_MESSAGE_LIMIT
    // real (paid) API round-trips.
    await supabaseAdmin.from('support_messages').insert(
      Array.from({ length: MONTHLY_AI_MESSAGE_LIMIT }, (_, i) => ({
        tenant_id: tenant.tenantId,
        request_id: request.id,
        sender_type: 'user',
        sender_user_id: tenant.userId,
        body: `synthetic message ${i}`,
      }))
    )

    const res = await tenant.fetch(`/api/support/requests/${request.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'one more please' }),
    })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/monthly AI Assistant usage limit/i)
  })

  it('creator can reply and update status', async () => {
    const listRes = await supportAdmin.fetch('/api/creator/support')
    const { requests } = await listRes.json()
    const target = requests.find((r: { tenant_id: string; channel: string }) => r.tenant_id === tenant.tenantId && r.channel === 'standard')

    const patchRes = await supportAdmin.fetch(`/api/creator/support/${target.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: 'Looking into this now.', status: 'agent_assigned' }),
    })
    expect(patchRes.status).toBe(200)
    expect((await patchRes.json()).request.status).toBe('agent_assigned')

    const detailRes = await supportAdmin.fetch(`/api/creator/support/${target.id}`)
    const detail = await detailRes.json()
    expect(detail.messages.some((m: { sender_type: string; body: string }) => m.sender_type === 'agent' && m.body === 'Looking into this now.')).toBe(true)
  })
})
