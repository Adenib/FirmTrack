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

describe('Intellectual Property registry (pure)', () => {
  it('maps "Intellectual Property" law_type to the intellectual_property template', () => {
    expect(getTemplateForLawType('Intellectual Property')).toBe('intellectual_property')
  })

  it('has 8 stages, none optional, starting at Trademark Request', () => {
    const stages = getWorkflowStages('intellectual_property')
    expect(stages).toHaveLength(8)
    expect(stages?.every((s) => !s.optional)).toBe(true)
    expect(getNextStage('intellectual_property', null)?.key).toBe('trademark_request')
  })

  it('advances sequentially through every stage to renewal_reminders', () => {
    const order = [
      'trademark_request', 'availability_search', 'client_approval', 'application_filing',
      'publication', 'opposition_period', 'registration', 'renewal_reminders',
    ]
    let current: string | null = null
    for (const expected of order) {
      current = getNextStage('intellectual_property', current)?.key ?? null
      expect(current).toBe(expected)
    }
    expect(getNextStage('intellectual_property', current)).toBeNull()
  })
})

describe('Intellectual Property workflow API', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('IntellectualPropertyTenant')
    const client = await createTestClient(tenant, 'IP Client')
    const matter = await createTestMatter(tenant, client.id, 'IP Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('starts, advances through every stage, creates an opposition-period deadline and a renewal deadline, and marks the matter completed', async () => {
    const start = await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'intellectual_property' }),
    })
    expect(start.status).toBe(200)
    expect((await start.json()).currentStage).toBe('trademark_request')

    const advance = async () => {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId }),
      })
      expect(res.status).toBe(200)
      return (await res.json()).currentStage
    }

    expect(await advance()).toBe('availability_search')
    expect(await advance()).toBe('client_approval')
    expect(await advance()).toBe('application_filing')
    expect(await advance()).toBe('publication')
    expect(await advance()).toBe('opposition_period')

    const { data: eventsAfterOpposition } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(eventsAfterOpposition?.some((e) => e.title.includes('Opposition period ends'))).toBe(true)

    expect(await advance()).toBe('registration')
    expect(await advance()).toBe('renewal_reminders')

    const { data: eventsAfterRenewal } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(eventsAfterRenewal?.some((e) => e.title.includes('Trademark renewal due'))).toBe(true)

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)
  })
})
