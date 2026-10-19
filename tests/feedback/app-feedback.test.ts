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

const APP_URL = 'http://localhost:3000'

describe('In-app feedback prompt', () => {
  let tenant: TestTenant
  let otherAdmin: TestPlatformAdmin

  beforeAll(async () => {
    tenant = await createTestTenant('FeedbackPrompt')
    otherAdmin = await createTestPlatformAdmin('developer')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
    await destroyTestPlatformAdmin(otherAdmin)
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/app-feedback/status`)
    expect(res.status).toBe(401)
  })

  it('does not show a prompt the very first time a user is checked', async () => {
    const res = await tenant.fetch('/api/app-feedback/status')
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.shouldShow).toBe(false)

    const { data } = await supabaseAdmin
      .from('app_feedback_prompts')
      .select('*')
      .eq('user_id', tenant.userId)
      .single()
    expect(data.prompt_count).toBe(0)
    expect(new Date(data.next_prompt_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('shows and advances the schedule once next_prompt_at has passed', async () => {
    // Force the row into "due now" state directly, same approach the
    // support-chat typing-indicator tests use for stale-expiry.
    await supabaseAdmin
      .from('app_feedback_prompts')
      .update({ next_prompt_at: new Date(Date.now() - 1000).toISOString() })
      .eq('user_id', tenant.userId)

    const res = await tenant.fetch('/api/app-feedback/status')
    const result = await res.json()
    expect(result.shouldShow).toBe(true)

    const { data } = await supabaseAdmin
      .from('app_feedback_prompts')
      .select('*')
      .eq('user_id', tenant.userId)
      .single()
    expect(data.prompt_count).toBe(1)
    // 2nd gap is 30 days -- comfortably more than 1 day away.
    expect(new Date(data.next_prompt_at).getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000)

    // Checking again immediately must not show it a second time.
    const res2 = await tenant.fetch('/api/app-feedback/status')
    expect((await res2.json()).shouldShow).toBe(false)
  })

  it('rejects an out-of-range rating', async () => {
    const res = await tenant.fetch('/api/app-feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 6 }),
    })
    expect(res.status).toBe(400)
  })

  it('accepts a submitted rating and comment, tenant-scoped', async () => {
    const res = await tenant.fetch('/api/app-feedback', {
      method: 'POST',
      body: JSON.stringify({ rating: 4, comment: 'Pretty good so far.' }),
    })
    expect(res.status).toBe(200)

    const { data } = await supabaseAdmin
      .from('app_feedback')
      .select('*')
      .eq('user_id', tenant.userId)
      .single()
    expect(data.rating).toBe(4)
    expect(data.comment).toBe('Pretty good so far.')
    expect(data.tenant_id).toBe(tenant.tenantId)
  })

  it('stops showing the prompt permanently after opting out', async () => {
    await supabaseAdmin
      .from('app_feedback_prompts')
      .update({ next_prompt_at: new Date(Date.now() - 1000).toISOString() })
      .eq('user_id', tenant.userId)

    const optOutRes = await tenant.fetch('/api/app-feedback/opt-out', { method: 'POST' })
    expect(optOutRes.status).toBe(200)

    const res = await tenant.fetch('/api/app-feedback/status')
    expect((await res.json()).shouldShow).toBe(false)
  })

  it('creator feedback list is gated to creator/admin cadres', async () => {
    const res = await otherAdmin.fetch('/api/creator/feedback')
    expect(res.status).toBe(403)
  })

  it('creator feedback list includes the submitted rating with org/user context', async () => {
    const creatorAdmin = await createTestPlatformAdmin('creator')
    try {
      const res = await creatorAdmin.fetch('/api/creator/feedback')
      expect(res.status).toBe(200)
      const result = await res.json()
      const entry = result.feedback.find((f: { user_email: string }) => f.user_email === tenant.email)
      expect(entry).toBeTruthy()
      expect(entry.rating).toBe(4)
      expect(entry.org_name).toBeTruthy()
      expect(result.stats.total).toBeGreaterThan(0)
    } finally {
      await destroyTestPlatformAdmin(creatorAdmin)
    }
  })
})
