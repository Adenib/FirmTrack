import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type })
}

describe('POST/GET /api/aitrack/document-reviews', () => {
  let tenant: TestTenant
  let matterId: string
  let txtDocId: string
  let pngDocId: string
  let linkedDocId: string

  beforeAll(async () => {
    tenant = await createTestTenant('AiDocReviewTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'doctrack', tier: 'free', is_active: true, price_per_user: 0,
    })

    const client = await createTestClient(tenant, 'AI Doc Review Client')
    const matter = await createTestMatter(tenant, client.id, 'AI Doc Review Matter')
    matterId = matter.id

    const txtForm = new FormData()
    txtForm.append('title', 'Simple NDA')
    txtForm.append('matter_id', matterId)
    txtForm.append('file', makeFile('nda.txt', 'This Non-Disclosure Agreement is entered into as of January 1, 2026 between Acme Corp and Beta Ltd.', 'text/plain'))
    const txtRes = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: txtForm })
    txtDocId = (await txtRes.json()).document.id

    const pngForm = new FormData()
    pngForm.append('title', 'Scanned Signature Page')
    pngForm.append('matter_id', matterId)
    pngForm.append('file', makeFile('signature.png', 'fake image bytes', 'image/png'))
    const pngRes = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: pngForm })
    pngDocId = (await pngRes.json()).document.id

    const { data: linkedDoc } = await supabaseAdmin
      .from('documents')
      .insert({
        tenant_id: tenant.tenantId,
        matter_id: matterId,
        title: 'Linked Engagement Letter',
        created_by: tenant.userId,
        external_source: 'onedrive',
        external_item_id: 'fake-item-id',
        external_web_url: 'https://contoso-my.sharepoint.com/personal/fake/Documents/engagement.pdf',
        external_filename: 'engagement.pdf',
      })
      .select()
      .single()
    linkedDocId = linkedDoc!.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/aitrack/document-reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_id: txtDocId }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects without an active aitrack subscription', async () => {
    const res = await tenant.fetch('/api/aitrack/document-reviews', {
      method: 'POST',
      body: JSON.stringify({ document_id: txtDocId }),
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

    it('requires document_id', async () => {
      const res = await tenant.fetch('/api/aitrack/document-reviews', { method: 'POST', body: JSON.stringify({}) })
      expect(res.status).toBe(400)
    })

    it('404s for a document that does not belong to this tenant', async () => {
      const res = await tenant.fetch('/api/aitrack/document-reviews', {
        method: 'POST',
        body: JSON.stringify({ document_id: '00000000-0000-0000-0000-000000000000' }),
      })
      expect(res.status).toBe(404)
    })

    it('rejects a linked (OneDrive/Outlook) document -- no local bytes to review', async () => {
      const res = await tenant.fetch('/api/aitrack/document-reviews', {
        method: 'POST',
        body: JSON.stringify({ document_id: linkedDocId }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/linked/i)
    })

    it('rejects an unsupported mime type (image) before ever attempting an AI call', async () => {
      const res = await tenant.fetch('/api/aitrack/document-reviews', {
        method: 'POST',
        body: JSON.stringify({ document_id: pngDocId }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/doesn't support/i)
    })

    it('404s for a playbook_id that does not belong to this tenant', async () => {
      const res = await tenant.fetch('/api/aitrack/document-reviews', {
        method: 'POST',
        body: JSON.stringify({ document_id: txtDocId, playbook_id: '00000000-0000-0000-0000-000000000000' }),
      })
      expect(res.status).toBe(404)
    })

    it('GET returns no review history before any review has run', async () => {
      const res = await tenant.fetch(`/api/aitrack/document-reviews?document_id=${txtDocId}`)
      expect(res.status).toBe(200)
      const { reviews } = await res.json()
      expect(reviews).toEqual([])
    })

    // ANTHROPIC_API_KEY is genuinely configured in this environment, so
    // this exercises the real end-to-end pipeline (extract -> Claude ->
    // structured output -> stored row -> logged event) against a real,
    // if minimal, NDA text -- not a stub. Slower than the other tests
    // here since it makes a real API call.
    it('runs a real review end-to-end and logs an ai_reviewed event', async () => {
      const res = await tenant.fetch('/api/aitrack/document-reviews', {
        method: 'POST',
        body: JSON.stringify({ document_id: txtDocId }),
      })
      expect(res.status).toBe(200)
      const { review } = await res.json()
      expect(review.tenant_id).toBe(tenant.tenantId)
      expect(review.document_id).toBe(txtDocId)
      expect(review.playbook_id).toBeNull()
      expect(review.playbook_results).toBeNull()
      expect(typeof review.summary).toBe('string')
      expect(review.summary.length).toBeGreaterThan(0)
      expect(Array.isArray(review.key_terms)).toBe(true)
      expect(Array.isArray(review.key_dates)).toBe(true)
      expect(Array.isArray(review.risk_flags)).toBe(true)
      expect(review.model).toBe('claude-haiku-4-5-20251001')

      const { data: events } = await supabaseAdmin
        .from('document_events')
        .select('*')
        .eq('document_id', txtDocId)
        .eq('event_type', 'ai_reviewed')
      expect(events).toHaveLength(1)
      expect(events![0].metadata.review_id).toBe(review.id)

      const listRes = await tenant.fetch(`/api/aitrack/document-reviews?document_id=${txtDocId}`)
      const { reviews } = await listRes.json()
      expect(reviews).toHaveLength(1)
      expect(reviews[0].id).toBe(review.id)
    })
  })
})
