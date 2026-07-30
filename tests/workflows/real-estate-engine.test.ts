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

describe('Real Estate registry (pure)', () => {
  it('maps "Real Estate" law_type to the real_estate template', () => {
    expect(getTemplateForLawType('Real Estate')).toBe('real_estate')
  })

  it('has 9 stages, none optional, starting at Client Request', () => {
    const stages = getWorkflowStages('real_estate')
    expect(stages).toHaveLength(9)
    expect(stages?.every((s) => !s.optional)).toBe(true)
    expect(getNextStage('real_estate', null)?.key).toBe('client_request')
  })

  it('advances sequentially through every stage to matter_closed', () => {
    const order = [
      'client_request', 'property_search', 'title_verification', 'due_diligence',
      'contract_drafting', 'execution', 'government_registration', 'payment_confirmation', 'matter_closed',
    ]
    let current: string | null = null
    for (const expected of order) {
      current = getNextStage('real_estate', current)?.key ?? null
      expect(current).toBe(expected)
    }
    expect(getNextStage('real_estate', current)).toBeNull()
  })
})

describe('Real Estate workflow API', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('RealEstateTenant')
    const client = await createTestClient(tenant, 'Real Estate Client')
    const matter = await createTestMatter(tenant, client.id, 'Real Estate Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('starts, advances through every stage, creates a registration-follow-up deadline, and marks the matter completed', async () => {
    const start = await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'real_estate' }),
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

    expect(await advance()).toBe('property_search')
    expect(await advance()).toBe('title_verification')
    expect(await advance()).toBe('due_diligence')
    expect(await advance()).toBe('contract_drafting')
    expect(await advance()).toBe('execution')
    expect(await advance()).toBe('government_registration')

    const { data: events } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(events?.some((e) => e.title.includes('Registration follow-up'))).toBe(true)

    expect(await advance()).toBe('payment_confirmation')
    expect(await advance()).toBe('matter_closed')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)

    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', matterId)
    expect(tasks?.some((t) => t.title.startsWith('Client Request:'))).toBe(true)
    expect(tasks?.some((t) => t.title.startsWith('Matter Closed:'))).toBe(true)
  })
})
