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

describe('Corporate Commercial registry (pure)', () => {
  it('maps law_type to the right template', () => {
    expect(getTemplateForLawType('Litigation')).toBe('litigation')
    expect(getTemplateForLawType('Corporate')).toBe('corporate_commercial')
    expect(getTemplateForLawType('Employment')).toBeNull()
    expect(getTemplateForLawType(null)).toBeNull()
  })

  it('has 10 stages, none optional, starting at KYC', () => {
    const stages = getWorkflowStages('corporate_commercial')
    expect(stages).toHaveLength(10)
    expect(stages?.every((s) => !s.optional)).toBe(true)
    expect(getNextStage('corporate_commercial', null)?.key).toBe('kyc')
  })

  it('advances sequentially through every stage to archive_matter', () => {
    const order = [
      'kyc', 'engagement_letter', 'due_diligence', 'document_review', 'draft_agreements',
      'client_review', 'negotiation', 'execution', 'closing', 'archive_matter',
    ]
    let current: string | null = null
    for (const expected of order) {
      current = getNextStage('corporate_commercial', current)?.key ?? null
      expect(current).toBe(expected)
    }
    expect(getNextStage('corporate_commercial', current)).toBeNull()
  })
})

describe('Corporate Commercial workflow API', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('CorpCommercialTenant')
    const client = await createTestClient(tenant, 'Corp Commercial Client')
    const matter = await createTestMatter(tenant, client.id, 'Corp Commercial Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('starts, advances through every stage, creates a closing deadline, and marks the matter completed', async () => {
    const start = await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'corporate_commercial' }),
    })
    expect(start.status).toBe(200)
    expect((await start.json()).currentStage).toBe('kyc')

    const advance = async () => {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId }),
      })
      expect(res.status).toBe(200)
      return (await res.json()).currentStage
    }

    expect(await advance()).toBe('engagement_letter')
    expect(await advance()).toBe('due_diligence')
    expect(await advance()).toBe('document_review')
    expect(await advance()).toBe('draft_agreements')
    expect(await advance()).toBe('client_review')
    expect(await advance()).toBe('negotiation')
    expect(await advance()).toBe('execution')
    expect(await advance()).toBe('closing')

    const { data: events } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(events?.some((e) => e.title.includes('Closing date'))).toBe(true)

    expect(await advance()).toBe('archive_matter')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)

    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', matterId)
    expect(tasks?.some((t) => t.title === 'KYC: Collect client KYC/ID and beneficial-ownership documents')).toBe(true)
    expect(tasks?.some((t) => t.title.startsWith('Archive Matter:'))).toBe(true)
  })
})
