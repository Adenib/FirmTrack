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

describe('Mergers & Acquisitions registry (pure)', () => {
  it('maps "Mergers & Acquisitions" law_type to the mergers_acquisitions template', () => {
    expect(getTemplateForLawType('Mergers & Acquisitions')).toBe('mergers_acquisitions')
  })

  it('has 9 stages, none optional, starting at Client Engagement', () => {
    const stages = getWorkflowStages('mergers_acquisitions')
    expect(stages).toHaveLength(9)
    expect(stages?.every((s) => !s.optional)).toBe(true)
    expect(getNextStage('mergers_acquisitions', null)?.key).toBe('client_engagement')
  })

  it('advances sequentially through every stage to post_closing_obligations', () => {
    const order = [
      'client_engagement', 'nda', 'due_diligence', 'risk_report', 'spa_drafting',
      'negotiation', 'signing', 'closing', 'post_closing_obligations',
    ]
    let current: string | null = null
    for (const expected of order) {
      current = getNextStage('mergers_acquisitions', current)?.key ?? null
      expect(current).toBe(expected)
    }
    expect(getNextStage('mergers_acquisitions', current)).toBeNull()
  })
})

describe('Mergers & Acquisitions workflow API', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('MergersAcquisitionsTenant')
    const client = await createTestClient(tenant, 'M&A Client')
    const matter = await createTestMatter(tenant, client.id, 'M&A Test Matter', {
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
      body: JSON.stringify({ matter_id: matterId, template: 'mergers_acquisitions' }),
    })
    expect(start.status).toBe(200)
    expect((await start.json()).currentStage).toBe('client_engagement')

    const advance = async () => {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId }),
      })
      expect(res.status).toBe(200)
      return (await res.json()).currentStage
    }

    expect(await advance()).toBe('nda')
    expect(await advance()).toBe('due_diligence')
    expect(await advance()).toBe('risk_report')
    expect(await advance()).toBe('spa_drafting')
    expect(await advance()).toBe('negotiation')
    expect(await advance()).toBe('signing')
    expect(await advance()).toBe('closing')

    const { data: events } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(events?.some((e) => e.title.includes('Closing date'))).toBe(true)

    expect(await advance()).toBe('post_closing_obligations')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)

    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', matterId)
    expect(tasks?.some((t) => t.title.startsWith('Client Engagement:'))).toBe(true)
    expect(tasks?.some((t) => t.title.startsWith('Post-Closing Obligations:'))).toBe(true)
  })
})
