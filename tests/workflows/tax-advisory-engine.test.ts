import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { getNextStage, getWorkflowStages, getTemplateForLawType } from '@/lib/workflows/registry'
import {
  createTestTenant,
  destroyTestTenant,
  createTestClient,
  createTestMatter,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

describe('Tax Advisory registry (pure)', () => {
  it('maps "Tax" law_type to the tax_advisory template', () => {
    expect(getTemplateForLawType('Tax')).toBe('tax_advisory')
  })

  it('has 8 stages, none optional, starting at Client Request', () => {
    const stages = getWorkflowStages('tax_advisory')
    expect(stages).toHaveLength(8)
    expect(stages?.every((s) => !s.optional)).toBe(true)
    expect(getNextStage('tax_advisory', null)?.key).toBe('client_request')
  })

  it('advances sequentially through every stage to follow_up', () => {
    const order = [
      'client_request', 'information_collection', 'research', 'opinion_drafting',
      'partner_review', 'client_delivery', 'implementation', 'follow_up',
    ]
    let current: string | null = null
    for (const expected of order) {
      current = getNextStage('tax_advisory', current)?.key ?? null
      expect(current).toBe(expected)
    }
    expect(getNextStage('tax_advisory', current)).toBeNull()
  })
})

describe('Tax Advisory workflow API', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('TaxAdvisoryTenant')
    const client = await createTestClient(tenant, 'Tax Advisory Client')
    const matter = await createTestMatter(tenant, client.id, 'Tax Advisory Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('starts, advances through every stage, and marks the matter completed at Follow-up', async () => {
    const start = await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'tax_advisory' }),
    })
    expect(start.status).toBe(200)
    expect((await start.json()).currentStage).toBe('client_request')

    const advance = async () => {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId }),
      })
      expect(res.status).toBe(200)
      return (await res.json()).currentStage
    }

    expect(await advance()).toBe('information_collection')
    expect(await advance()).toBe('research')
    expect(await advance()).toBe('opinion_drafting')
    expect(await advance()).toBe('partner_review')
    expect(await advance()).toBe('client_delivery')
    expect(await advance()).toBe('implementation')
    expect(await advance()).toBe('follow_up')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)

    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', matterId)
    expect(tasks?.some((t) => t.title === 'Client Request: Clarify scope of advice needed')).toBe(true)
    expect(tasks?.some((t) => t.title.startsWith('Follow-up:'))).toBe(true)
  })
})
