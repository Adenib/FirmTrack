import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  destroyTestTenant,
  createTestClient,
  createTestMatter,
  type TestTenant,
} from '../helpers/test-client'

describe('POST /api/timetrack/ai-draft', () => {
  let tenant: TestTenant
  let matterId: string
  let calendarEventId: string

  beforeAll(async () => {
    tenant = await createTestTenant('AiDraftRouteTenant')
    const client = await createTestClient(tenant, 'AI Draft Client')
    const matter = await createTestMatter(tenant, client.id, 'AI Draft Test Matter')
    matterId = matter.id

    const eventRes = await tenant.fetch('/api/calentrack', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Call with client re: settlement terms',
        description: 'Discuss counteroffer',
        start_at: '2026-08-01T10:00:00.000Z',
        end_at: '2026-08-01T11:30:00.000Z',
        matter_id: matterId,
      }),
    })
    const eventBody = await eventRes.json()
    calendarEventId = eventBody.event.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication', async () => {
    const res = await fetch('http://localhost:3000/api/timetrack/ai-draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ calendar_event_id: calendarEventId }),
    })
    expect(res.status).toBe(401)
  })

  it('is rejected while the firm has not enabled AI drafting (the default)', async () => {
    const res = await tenant.fetch('/api/timetrack/ai-draft', {
      method: 'POST',
      body: JSON.stringify({ calendar_event_id: calendarEventId }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/not enabled/i)
  })

  it('requires calendar_event_id', async () => {
    await tenant.fetch('/api/timetrack/settings', {
      method: 'PUT',
      body: JSON.stringify({ ai_drafting_enabled: true }),
    })
    const res = await tenant.fetch('/api/timetrack/ai-draft', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('404s for a calendar event that does not belong to this tenant', async () => {
    const res = await tenant.fetch('/api/timetrack/ai-draft', {
      method: 'POST',
      body: JSON.stringify({ calendar_event_id: '00000000-0000-0000-0000-000000000000' }),
    })
    expect(res.status).toBe(404)
  })

  it('once enabled, reaches the platform-level gate and reports AI as not configured (no ANTHROPIC_API_KEY in this environment, so no real API call is ever made)', async () => {
    const res = await tenant.fetch('/api/timetrack/ai-draft', {
      method: 'POST',
      body: JSON.stringify({ calendar_event_id: calendarEventId }),
    })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/not configured/i)
  })
})
