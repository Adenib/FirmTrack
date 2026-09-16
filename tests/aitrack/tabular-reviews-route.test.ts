import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type })
}

const sampleFields = [
  { label: 'Effective Date', instructions: "Extract the document's effective date." },
  { label: 'Governing Law', instructions: 'Extract the governing law/jurisdiction.' },
]

describe('POST/GET /api/aitrack/tabular-reviews', () => {
  let tenant: TestTenant
  let matterId: string
  let doc1Id: string
  let doc2Id: string
  let linkedDocId: string

  beforeAll(async () => {
    tenant = await createTestTenant('AiTabularReviewTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'doctrack', tier: 'free', is_active: true, price_per_user: 0,
    })

    const client = await createTestClient(tenant, 'AI Tabular Review Client')
    const matter = await createTestMatter(tenant, client.id, 'AI Tabular Review Matter')
    matterId = matter.id

    const form1 = new FormData()
    form1.append('title', 'Lease Agreement A')
    form1.append('matter_id', matterId)
    form1.append('file', makeFile('lease-a.txt', 'This Lease Agreement is entered into as of March 1, 2026, governed by the laws of Lagos State.', 'text/plain'))
    const res1 = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: form1 })
    doc1Id = (await res1.json()).document.id

    const form2 = new FormData()
    form2.append('title', 'Lease Agreement B')
    form2.append('matter_id', matterId)
    form2.append('file', makeFile('lease-b.txt', 'This Lease Agreement is entered into as of June 15, 2026, governed by the laws of Rivers State.', 'text/plain'))
    const res2 = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: form2 })
    doc2Id = (await res2.json()).document.id

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
    const res = await fetch(`${APP_URL}/api/aitrack/tabular-reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: sampleFields, document_ids: [doc1Id] }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects without an active aitrack subscription', async () => {
    const res = await tenant.fetch('/api/aitrack/tabular-reviews', {
      method: 'POST',
      body: JSON.stringify({ fields: sampleFields, document_ids: [doc1Id] }),
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

    it('rejects an empty fields array', async () => {
      const res = await tenant.fetch('/api/aitrack/tabular-reviews', {
        method: 'POST',
        body: JSON.stringify({ fields: [], document_ids: [doc1Id] }),
      })
      expect(res.status).toBe(400)
    })

    it('rejects a field missing instructions', async () => {
      const res = await tenant.fetch('/api/aitrack/tabular-reviews', {
        method: 'POST',
        body: JSON.stringify({ fields: [{ label: 'Only a label' }], document_ids: [doc1Id] }),
      })
      expect(res.status).toBe(400)
    })

    it('rejects an empty document_ids array', async () => {
      const res = await tenant.fetch('/api/aitrack/tabular-reviews', {
        method: 'POST',
        body: JSON.stringify({ fields: sampleFields, document_ids: [] }),
      })
      expect(res.status).toBe(400)
    })

    it('rejects a batch larger than the max documents cap', async () => {
      const tooMany = Array.from({ length: 16 }, () => doc1Id)
      const res = await tenant.fetch('/api/aitrack/tabular-reviews', {
        method: 'POST',
        body: JSON.stringify({ fields: sampleFields, document_ids: tooMany }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/at most 15/i)
    })

    it('GET returns no reviews before any batch has run', async () => {
      const res = await tenant.fetch('/api/aitrack/tabular-reviews')
      expect(res.status).toBe(200)
      const { reviews } = await res.json()
      expect(reviews).toEqual([])
    })

    // ANTHROPIC_API_KEY is genuinely configured in this environment, so
    // this exercises the real end-to-end pipeline for a batch of real
    // documents, plus a linked and a cross-tenant document that should
    // both become per-row errors rather than aborting the whole batch.
    let reviewId: string
    it('runs a real batch end-to-end: valid docs succeed, linked/invalid docs become error rows', async () => {
      const otherTenant = await createTestTenant('OtherTenantForTabularReviewIsolation')
      try {
        const res = await tenant.fetch('/api/aitrack/tabular-reviews', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Lease Batch Test',
            fields: sampleFields,
            document_ids: [doc1Id, doc2Id, linkedDocId, otherTenant.tenantId],
          }),
        })
        expect(res.status).toBe(200)
        const { review, rows } = await res.json()
        reviewId = review.id
        expect(review.tenant_id).toBe(tenant.tenantId)
        expect(review.name).toBe('Lease Batch Test')
        expect(review.fields).toEqual(sampleFields)
        expect(rows).toHaveLength(4)

        const row1 = rows.find((r: any) => r.document_id === doc1Id)
        expect(row1.error).toBeNull()
        expect(row1.values.map((v: any) => v.label)).toEqual(['Effective Date', 'Governing Law'])

        const row2 = rows.find((r: any) => r.document_id === doc2Id)
        expect(row2.error).toBeNull()

        const linkedRow = rows.find((r: any) => r.document_id === linkedDocId)
        expect(linkedRow.error).toMatch(/linked/i)
        expect(linkedRow.values).toBeNull()

        // otherTenant.tenantId isn't a real document id in this tenant's
        // scope at all -- becomes a "not found" error row, not a 404
        // for the whole request.
        const notFoundRow = rows.find((r: any) => r.document_title === '(unknown document)')
        expect(notFoundRow.error).toMatch(/not found/i)
      } finally {
        await destroyTestTenant(otherTenant)
      }
    }, 60000)

    it('GET list shows the run with a row count, and GET by id shows the full table', async () => {
      const listRes = await tenant.fetch('/api/aitrack/tabular-reviews')
      const { reviews } = await listRes.json()
      const found = reviews.find((r: any) => r.id === reviewId)
      expect(found).toBeTruthy()
      expect(found.rows[0].count).toBe(4)

      const detailRes = await tenant.fetch(`/api/aitrack/tabular-reviews/${reviewId}`)
      expect(detailRes.status).toBe(200)
      const { review, rows } = await detailRes.json()
      expect(review.id).toBe(reviewId)
      expect(rows).toHaveLength(4)
    })

    it('GET by id 404s for a nonexistent/cross-tenant review id', async () => {
      const res = await tenant.fetch('/api/aitrack/tabular-reviews/00000000-0000-0000-0000-000000000000')
      expect(res.status).toBe(404)
    })
  })
})
