import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('POST/GET /api/aitrack/research-memos', () => {
  let tenant: TestTenant
  let matterId: string
  let matterCaseName: string

  beforeAll(async () => {
    tenant = await createTestTenant('AiResearchMemoTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'doctrack', tier: 'free', is_active: true, price_per_user: 0,
    })

    const client = await createTestClient(tenant, 'AI Research Memo Client')
    const matter = await createTestMatter(tenant, client.id, 'AI Research Memo Matter')
    matterId = matter.id
    matterCaseName = matter.case_name
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/aitrack/research-memos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'x' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects without an active aitrack subscription', async () => {
    const res = await tenant.fetch('/api/aitrack/research-memos', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is consideration in contract law?' }),
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

    it('requires question', async () => {
      const res = await tenant.fetch('/api/aitrack/research-memos', { method: 'POST', body: JSON.stringify({}) })
      expect(res.status).toBe(400)
    })

    it('404s for a matter_id that does not belong to this tenant', async () => {
      const res = await tenant.fetch('/api/aitrack/research-memos', {
        method: 'POST',
        body: JSON.stringify({ question: 'x', matter_id: '00000000-0000-0000-0000-000000000000' }),
      })
      expect(res.status).toBe(404)
    })

    it('GET returns no memos before any research has been run', async () => {
      const res = await tenant.fetch('/api/aitrack/research-memos')
      expect(res.status).toBe(200)
      const { memos } = await res.json()
      expect(memos).toEqual([])
    })

    // ANTHROPIC_API_KEY is genuinely configured in this environment, so
    // this exercises the real end-to-end pipeline (Claude + real web
    // search -> structured output -> stored row), not a stub.
    it('generates a real research memo end-to-end, grounded in the matter', async () => {
      const res = await tenant.fetch('/api/aitrack/research-memos', {
        method: 'POST',
        body: JSON.stringify({
          question: 'What are the essential elements of a valid contract?',
          matter_id: matterId,
        }),
      })
      expect(res.status).toBe(200)
      const { memo } = await res.json()
      expect(memo.tenant_id).toBe(tenant.tenantId)
      expect(memo.matter_id).toBe(matterId)
      expect(typeof memo.content).toBe('string')
      expect(memo.content.length).toBeGreaterThan(0)
      expect(Array.isArray(memo.sources)).toBe(true)
      expect(memo.model).toBe('claude-haiku-4-5-20251001')

      const listRes = await tenant.fetch('/api/aitrack/research-memos')
      const { memos } = await listRes.json()
      expect(memos).toHaveLength(1)
      expect(memos[0].id).toBe(memo.id)
      expect(memos[0].matters?.case_name).toBe(matterCaseName)
    }, 60000)

    it('works without a matter (firm-wide research)', async () => {
      const res = await tenant.fetch('/api/aitrack/research-memos', {
        method: 'POST',
        body: JSON.stringify({ question: 'What is the difference between a condition and a warranty in contract law?' }),
      })
      expect(res.status).toBe(200)
      const { memo } = await res.json()
      expect(memo.matter_id).toBeNull()
    }, 60000)
  })
})
