import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('POST/GET /api/aitrack/document-drafts', () => {
  let tenant: TestTenant
  let matterId: string
  let matterCaseName: string

  beforeAll(async () => {
    tenant = await createTestTenant('AiDocDraftTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'doctrack', tier: 'free', is_active: true, price_per_user: 0,
    })

    const client = await createTestClient(tenant, 'AI Doc Draft Client')
    const matter = await createTestMatter(tenant, client.id, 'AI Doc Draft Matter')
    matterId = matter.id
    matterCaseName = matter.case_name
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/aitrack/document-drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_type: 'NDA', prompt: 'x' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects without an active aitrack subscription', async () => {
    const res = await tenant.fetch('/api/aitrack/document-drafts', {
      method: 'POST',
      body: JSON.stringify({ document_type: 'NDA', prompt: 'A mutual NDA between two companies.' }),
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

    it('requires document_type and prompt', async () => {
      const res = await tenant.fetch('/api/aitrack/document-drafts', { method: 'POST', body: JSON.stringify({ document_type: 'NDA' }) })
      expect(res.status).toBe(400)
    })

    it('404s for a matter_id that does not belong to this tenant', async () => {
      const res = await tenant.fetch('/api/aitrack/document-drafts', {
        method: 'POST',
        body: JSON.stringify({ document_type: 'NDA', matter_id: '00000000-0000-0000-0000-000000000000', prompt: 'x' }),
      })
      expect(res.status).toBe(404)
    })

    it('GET returns no drafts before any have been generated', async () => {
      const res = await tenant.fetch('/api/aitrack/document-drafts')
      expect(res.status).toBe(200)
      const { drafts } = await res.json()
      expect(drafts).toEqual([])
    })

    // ANTHROPIC_API_KEY is genuinely configured in this environment, so
    // this exercises the real end-to-end pipeline (Claude -> structured
    // output -> stored row), not a stub, then saves the result into
    // DocTrack through the existing upload endpoint exactly as the page
    // does, proving the two features actually connect.
    let draftId: string
    let draftContent: string
    it('generates a real draft end-to-end, grounded in the matter', async () => {
      const res = await tenant.fetch('/api/aitrack/document-drafts', {
        method: 'POST',
        body: JSON.stringify({
          document_type: 'NDA',
          matter_id: matterId,
          prompt: 'A mutual non-disclosure agreement between Acme Corp and Beta Ltd for a joint venture discussion.',
        }),
      })
      expect(res.status).toBe(200)
      const { draft } = await res.json()
      expect(draft.tenant_id).toBe(tenant.tenantId)
      expect(draft.matter_id).toBe(matterId)
      expect(draft.document_type).toBe('NDA')
      expect(typeof draft.content).toBe('string')
      expect(draft.content.length).toBeGreaterThan(0)
      expect(typeof draft.notes).toBe('string')
      expect(draft.model).toBe('claude-haiku-4-5-20251001')
      draftId = draft.id
      draftContent = draft.content

      const listRes = await tenant.fetch('/api/aitrack/document-drafts')
      const { drafts } = await listRes.json()
      expect(drafts).toHaveLength(1)
      expect(drafts[0].id).toBe(draftId)
      expect(drafts[0].matters?.case_name).toBe(matterCaseName)
    })

    it('the saved draft can be uploaded to DocTrack via the existing upload endpoint, and then reviewed', async () => {
      const formData = new FormData()
      formData.append('title', 'Draft NDA — Acme/Beta')
      formData.append('matter_id', matterId)
      formData.append('category', 'AI Draft')
      formData.append('file', new File([draftContent], 'Draft NDA.txt', { type: 'text/plain' }))

      const uploadRes = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: formData })
      expect(uploadRes.status).toBe(200)
      const { document } = await uploadRes.json()
      expect(document.matter_id).toBe(matterId)

      // Prove the loop actually closes: AI Review can run against the AI-drafted document.
      const reviewRes = await tenant.fetch('/api/aitrack/document-reviews', {
        method: 'POST',
        body: JSON.stringify({ document_id: document.id }),
      })
      expect(reviewRes.status).toBe(200)
      const { review } = await reviewRes.json()
      expect(review.document_id).toBe(document.id)
      expect(review.summary.length).toBeGreaterThan(0)
    })

    it('works without a matter (firm-wide draft)', async () => {
      const res = await tenant.fetch('/api/aitrack/document-drafts', {
        method: 'POST',
        body: JSON.stringify({ document_type: 'Engagement Letter', prompt: 'A generic engagement letter template for new corporate clients.' }),
      })
      expect(res.status).toBe(200)
      const { draft } = await res.json()
      expect(draft.matter_id).toBeNull()
    })
  })
})
