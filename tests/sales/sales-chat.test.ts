import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestPlatformAdmin,
  destroyTestPlatformAdmin,
  supabaseAdmin,
  type TestPlatformAdmin,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('Sales chat (anonymous "Chat with Sales" leads)', () => {
  let salesAdmin: TestPlatformAdmin
  let secondSalesAdmin: TestPlatformAdmin
  let devAdmin: TestPlatformAdmin

  beforeAll(async () => {
    salesAdmin = await createTestPlatformAdmin('sales')
    secondSalesAdmin = await createTestPlatformAdmin('sales')
    devAdmin = await createTestPlatformAdmin('developer')
  })

  afterAll(async () => {
    // sales_leads has no tenant to scope a throwaway org around (a
    // prospect isn't a subscriber), so it's not covered by
    // destroyTestTenant -- clean it up explicitly instead of leaving it
    // behind in the real Creator Console's Sales Chat list.
    if (leadId) await supabaseAdmin.from('sales_leads').delete().eq('id', leadId)
    await destroyTestPlatformAdmin(salesAdmin)
    await destroyTestPlatformAdmin(secondSalesAdmin)
    await destroyTestPlatformAdmin(devAdmin)
  })

  it('rejects creating a lead with an invalid email, no auth required otherwise', async () => {
    const res = await fetch(`${APP_URL}/api/sales-chat/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Prospect', email: 'not-an-email', phone: '555', message: 'Hi' }),
    })
    expect(res.status).toBe(400)
  })

  let leadId: string
  let leadToken: string

  it('creates a lead anonymously and returns an access token', async () => {
    const res = await fetch(`${APP_URL}/api/sales-chat/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada Prospect', email: 'ada@example.com', phone: '08012345678', message: 'What does BillTrack cost for 10 users?' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.lead.id).toBeTruthy()
    expect(body.lead.access_token).toBeTruthy()
    leadId = body.lead.id
    leadToken = body.lead.access_token
  })

  it('the initial message is recorded in the thread', async () => {
    const res = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages?token=${leadToken}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages.some((m: { body: string }) => m.body.includes('BillTrack'))).toBe(true)
    expect(body.status).toBe('open')
  })

  it('rejects fetching messages with a wrong or missing token', async () => {
    const wrongTokenRes = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages?token=not-the-real-token`)
    expect(wrongTokenRes.status).toBe(404)

    const noTokenRes = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages`)
    expect(noTokenRes.status).toBe(404)
  })

  it('Creator Console sales-leads access requires the sales (or creator/admin) cadre', async () => {
    const unauthedRes = await fetch(`${APP_URL}/api/creator/sales-leads`)
    expect(unauthedRes.status).toBe(401)

    const devRes = await devAdmin.fetch('/api/creator/sales-leads')
    expect(devRes.status).toBe(403)

    const salesRes = await salesAdmin.fetch('/api/creator/sales-leads')
    expect(salesRes.status).toBe(200)
    const body = await salesRes.json()
    expect(body.leads.some((l: { id: string }) => l.id === leadId)).toBe(true)
  })

  it('an agent can reply, and the lead sees it in their own thread', async () => {
    const replyRes = await salesAdmin.fetch(`/api/creator/sales-leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: 'Happy to help -- BillTrack is included free with every plan.' }),
    })
    expect(replyRes.status).toBe(200)

    const leadViewRes = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages?token=${leadToken}`)
    const leadView = await leadViewRes.json()
    expect(leadView.messages.some((m: { sender_type: string; body: string }) => m.sender_type === 'agent' && m.body.includes('free with every plan'))).toBe(true)
  })

  it('the lead can send a follow-up message', async () => {
    const res = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: leadToken, body: 'Great, how do I sign up?' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message.sender_type).toBe('lead')
  })

  it('typing indicators: each side sees the other typing, and it goes stale on its own', async () => {
    const initialRes = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages?token=${leadToken}`)
    expect((await initialRes.json()).agentTyping).toBe(false)

    const agentPingRes = await salesAdmin.fetch(`/api/creator/sales-leads/${leadId}/typing`, { method: 'POST' })
    expect(agentPingRes.status).toBe(200)
    const afterPing = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages?token=${leadToken}`)
    expect((await afterPing.json()).agentTyping).toBe(true)

    const leadPingRes = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/typing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: leadToken }),
    })
    expect(leadPingRes.status).toBe(200)
    const afterLeadPing = await salesAdmin.fetch(`/api/creator/sales-leads/${leadId}`)
    expect((await afterLeadPing.json()).leadTyping).toBe(true)

    await supabaseAdmin
      .from('sales_leads')
      .update({ agent_typing_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', leadId)
    const afterStale = await fetch(`${APP_URL}/api/sales-chat/leads/${leadId}/messages?token=${leadToken}`)
    expect((await afterStale.json()).agentTyping).toBe(false)
  })

  it('status can be updated, and reassignment only to an active sales-access admin, with notification', async () => {
    const statusRes = await salesAdmin.fetch(`/api/creator/sales-leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'contacted' }),
    })
    expect(statusRes.status).toBe(200)
    expect((await statusRes.json()).lead.status).toBe('contacted')

    const badReassignRes = await salesAdmin.fetch(`/api/creator/sales-leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: devAdmin.adminId }),
    })
    expect(badReassignRes.status).toBe(400)

    const goodReassignRes = await salesAdmin.fetch(`/api/creator/sales-leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: secondSalesAdmin.adminId }),
    })
    expect(goodReassignRes.status).toBe(200)
    expect((await goodReassignRes.json()).lead.assigned_to).toBe(secondSalesAdmin.adminId)

    const detailRes = await secondSalesAdmin.fetch(`/api/creator/sales-leads/${leadId}`)
    expect(detailRes.status).toBe(200)
  })
})
