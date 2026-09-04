import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'
import { MONTHLY_AI_MESSAGE_LIMIT } from '@/lib/ai/usage-limits'

const APP_URL = 'http://localhost:3000'

describe('AITrack Expert Agent chat', () => {
  let tenant: TestTenant
  let otherUser: TestTenant
  let privateAgentId: string
  let sharedAgentId: string

  beforeAll(async () => {
    tenant = await createTestTenant('AiExpertAgentMsgTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'aitrack', tier: 'free', is_active: true, price_per_user: 0,
    })
    otherUser = await createTestUser(tenant, { role: 'staff' })

    const privateRes = await tenant.fetch('/api/aitrack/expert-agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Private Expert', instructions: 'You are a general practice advisor.', visibility: 'private' }),
    })
    privateAgentId = (await privateRes.json()).agent.id

    const sharedRes = await tenant.fetch('/api/aitrack/expert-agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Shared Expert', instructions: 'You are a general practice advisor.', visibility: 'shared' }),
    })
    sharedAgentId = (await sharedRes.json()).agent.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/aitrack/expert-agents/${privateAgentId}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'hi' }),
    })
    expect(res.status).toBe(401)
  })

  it('404s for an unknown agent id', async () => {
    const res = await tenant.fetch('/api/aitrack/expert-agents/00000000-0000-0000-0000-000000000000/messages', {
      method: 'POST', body: JSON.stringify({ body: 'hi' }),
    })
    expect(res.status).toBe(404)
  })

  it('GET returns no messages before any chat has happened', async () => {
    const res = await tenant.fetch(`/api/aitrack/expert-agents/${privateAgentId}/messages`)
    expect(res.status).toBe(200)
    const { messages } = await res.json()
    expect(messages).toEqual([])
  })

  // ANTHROPIC_API_KEY is genuinely configured in this environment, so
  // this exercises the real end-to-end pipeline, not a stub.
  it('sends a real message end-to-end and stores both turns', async () => {
    const res = await tenant.fetch(`/api/aitrack/expert-agents/${privateAgentId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'In one sentence, what can you help with?' }),
    })
    expect(res.status).toBe(200)
    const { message } = await res.json()
    expect(message.sender_type).toBe('ai')
    expect(typeof message.body).toBe('string')
    expect(message.body.length).toBeGreaterThan(0)

    const listRes = await tenant.fetch(`/api/aitrack/expert-agents/${privateAgentId}/messages`)
    const { messages } = await listRes.json()
    expect(messages).toHaveLength(2)
    expect(messages[0].sender_type).toBe('user')
    expect(messages[1].sender_type).toBe('ai')
  }, 30000)

  it('privacy: a private agent 403s another user reading a different user_id', async () => {
    const res = await otherUser.fetch(`/api/aitrack/expert-agents/${privateAgentId}/messages?user_id=${tenant.userId}`)
    expect(res.status).toBe(403)
  })

  it('conversations endpoint on a private agent only ever returns the caller\'s own entry', async () => {
    const res = await otherUser.fetch(`/api/aitrack/expert-agents/${privateAgentId}/conversations`)
    expect(res.status).toBe(200)
    const { conversations } = await res.json()
    expect(conversations.every((c: any) => c.user_id === otherUser.userId)).toBe(true)
  })

  it('sharing: a shared agent allows another user to read someone else\'s conversation, but they cannot post into it', async () => {
    const postRes = await tenant.fetch(`/api/aitrack/expert-agents/${sharedAgentId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'Second real message for the shared agent.' }),
    })
    expect(postRes.status).toBe(200)

    const readRes = await otherUser.fetch(`/api/aitrack/expert-agents/${sharedAgentId}/messages?user_id=${tenant.userId}`)
    expect(readRes.status).toBe(200)
    const { messages } = await readRes.json()
    expect(messages.length).toBeGreaterThan(0)

    const convRes = await otherUser.fetch(`/api/aitrack/expert-agents/${sharedAgentId}/conversations`)
    const { conversations } = await convRes.json()
    expect(conversations.find((c: any) => c.user_id === tenant.userId)).toBeTruthy()

    // otherUser POSTing always writes to THEIR OWN conversation, never
    // tenant.userId's, regardless of the ?user_id read above.
    await otherUser.fetch(`/api/aitrack/expert-agents/${sharedAgentId}/messages`, {
      method: 'POST', body: JSON.stringify({ body: 'A message from otherUser.' }),
    })
    const ownerMessagesRes = await tenant.fetch(`/api/aitrack/expert-agents/${sharedAgentId}/messages`)
    const { messages: ownerMessages } = await ownerMessagesRes.json()
    expect(ownerMessages.some((m: any) => m.body === 'A message from otherUser.')).toBe(false)
  }, 30000)

  it('rejects a message once the monthly per-tenant usage limit is reached', async () => {
    // Simulate having already hit the monthly cap -- directly inserting
    // MONTHLY_AI_MESSAGE_LIMIT synthetic 'user' messages this month is
    // the only practical way to test this without real (paid) API
    // round-trips, mirroring support-requests.test.ts's cap test.
    await supabaseAdmin.from('ai_expert_agent_messages').insert(
      Array.from({ length: MONTHLY_AI_MESSAGE_LIMIT }, (_, i) => ({
        tenant_id: tenant.tenantId,
        agent_id: privateAgentId,
        user_id: tenant.userId,
        sender_type: 'user',
        body: `synthetic message ${i}`,
      }))
    )

    const res = await tenant.fetch(`/api/aitrack/expert-agents/${privateAgentId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'one more please' }),
    })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/monthly Expert Agent usage limit/i)
  })
})
