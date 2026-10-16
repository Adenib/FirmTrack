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
  let secondSupportAdmin: TestPlatformAdmin

  beforeAll(async () => {
    tenant = await createTestTenant('SupportTenant')
    otherTenant = await createTestTenant('SupportOtherTenant')
    devAdmin = await createTestPlatformAdmin('developer')
    supportAdmin = await createTestPlatformAdmin('admin')
    secondSupportAdmin = await createTestPlatformAdmin('admin')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
    await destroyTestTenant(otherTenant)
    await destroyTestPlatformAdmin(devAdmin)
    await destroyTestPlatformAdmin(supportAdmin)
    await destroyTestPlatformAdmin(secondSupportAdmin)
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

  it('rejects an ai_assisted request when the firm has not subscribed to aitrack', async () => {
    const res = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'AI help please', description: 'x', channel: 'ai_assisted' }),
    })
    expect(res.status).toBe(403)
  })

  it('an active ai_support subscription alone is no longer sufficient -- the gate moved to aitrack', async () => {
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'ai_support', tier: 'basic', is_active: true, price_per_user: 2000,
    })
    const res = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'AI help please', description: 'x', channel: 'ai_assisted' }),
    })
    expect(res.status).toBe(403)
  })

  it('allows an ai_assisted request once aitrack is an active subscription', async () => {
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'aitrack', tier: 'basic', is_active: true, price_per_user: 2000,
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

  it('accepts a plain user message on a standard-channel request (live human chat, no AI call)', async () => {
    const createRes = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Standard one', description: 'x', channel: 'standard' }),
    })
    const { request } = await createRes.json()

    const msgRes = await tenant.fetch(`/api/support/requests/${request.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'hello, following up on this' }),
    })
    expect(msgRes.status).toBe(200)
    const msgBody = await msgRes.json()
    expect(msgBody.message.sender_type).toBe('user')
    expect(msgBody.message.body).toBe('hello, following up on this')

    const getRes = await tenant.fetch(`/api/support/requests/${request.id}/messages`)
    const getBody = await getRes.json()
    expect(getBody.messages.some((m: { body: string }) => m.body === 'hello, following up on this')).toBe(true)
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

  it('typing indicators: each side sees the other typing, and it goes stale on its own', async () => {
    const createRes = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Typing test', description: 'x', channel: 'standard' }),
    })
    const { request } = await createRes.json()

    // Before either side pings, neither sees the other typing.
    const initialRes = await tenant.fetch(`/api/support/requests/${request.id}/messages`)
    expect((await initialRes.json()).agentTyping).toBe(false)

    // Agent pings -- the subscriber's GET reflects it.
    const agentPingRes = await supportAdmin.fetch(`/api/creator/support/${request.id}/typing`, { method: 'POST' })
    expect(agentPingRes.status).toBe(200)
    const afterAgentPing = await tenant.fetch(`/api/support/requests/${request.id}/messages`)
    expect((await afterAgentPing.json()).agentTyping).toBe(true)

    // Subscriber pings -- the agent's GET reflects it.
    const userPingRes = await tenant.fetch(`/api/support/requests/${request.id}/typing`, { method: 'POST' })
    expect(userPingRes.status).toBe(200)
    const afterUserPing = await supportAdmin.fetch(`/api/creator/support/${request.id}`)
    expect((await afterUserPing.json()).userTyping).toBe(true)

    // A stale ping (older than the typing window) reads back as not typing.
    await supabaseAdmin
      .from('support_requests')
      .update({ agent_typing_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', request.id)
    const afterStale = await tenant.fetch(`/api/support/requests/${request.id}/messages`)
    expect((await afterStale.json()).agentTyping).toBe(false)
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

  it('transcript: requires authorization, only available once resolved, emails both parties', async () => {
    const createRes = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Transcript test', description: 'x', channel: 'standard' }),
    })
    const { request } = await createRes.json()

    const unauthedRes = await fetch(`http://localhost:3000/api/support/requests/${request.id}/transcript`, { method: 'POST' })
    expect(unauthedRes.status).toBe(401)

    const otherTenantRes = await otherTenant.fetch(`/api/support/requests/${request.id}/transcript`, { method: 'POST' })
    expect(otherTenantRes.status).toBe(403)

    const tooEarlyRes = await tenant.fetch(`/api/support/requests/${request.id}/transcript`, { method: 'POST' })
    expect(tooEarlyRes.status).toBe(400)

    await supportAdmin.fetch(`/api/creator/support/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    })

    const subscriberRes = await tenant.fetch(`/api/support/requests/${request.id}/transcript`, { method: 'POST' })
    expect(subscriberRes.status).toBe(200)
    const subscriberBody = await subscriberRes.json()
    expect(subscriberBody.sent).toBe(true)
    expect(subscriberBody.recipients.length).toBeGreaterThan(0)

    const agentRes = await supportAdmin.fetch(`/api/support/requests/${request.id}/transcript`, { method: 'POST' })
    expect(agentRes.status).toBe(200)
  })

  it('severity can be bumped up after creation', async () => {
    const createRes = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Severity bump test', description: 'x', channel: 'standard', severity: 'C' }),
    })
    const { request } = await createRes.json()

    const badRes = await supportAdmin.fetch(`/api/creator/support/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ severity: 'Z' }),
    })
    expect(badRes.status).toBe(400)

    const bumpRes = await supportAdmin.fetch(`/api/creator/support/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ severity: 'A' }),
    })
    expect(bumpRes.status).toBe(200)
    expect((await bumpRes.json()).request.severity).toBe('A')
  })

  it('reassignment: only to an active admin with support access, notifies them', async () => {
    const createRes = await tenant.fetch('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Reassignment test', description: 'x', channel: 'standard' }),
    })
    const { request } = await createRes.json()

    // devAdmin has the 'developer' cadre, which has no support access.
    const badRes = await supportAdmin.fetch(`/api/creator/support/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: devAdmin.adminId }),
    })
    expect(badRes.status).toBe(400)

    const goodRes = await supportAdmin.fetch(`/api/creator/support/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: secondSupportAdmin.adminId }),
    })
    expect(goodRes.status).toBe(200)
    expect((await goodRes.json()).request.assigned_to).toBe(secondSupportAdmin.adminId)

    // The newly-assigned admin can act on it even though they weren't
    // the one who originally touched it.
    const detailRes = await secondSupportAdmin.fetch(`/api/creator/support/${request.id}`)
    expect(detailRes.status).toBe(200)
  })
})
