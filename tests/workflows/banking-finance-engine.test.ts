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

describe('Banking & Finance registry (pure)', () => {
  it('maps "Banking & Finance" law_type to the banking_finance template', () => {
    expect(getTemplateForLawType('Banking & Finance')).toBe('banking_finance')
  })

  it('has 10 stages, none optional, starting at Client Engagement', () => {
    const stages = getWorkflowStages('banking_finance')
    expect(stages).toHaveLength(10)
    expect(stages?.every((s) => !s.optional)).toBe(true)
    expect(getNextStage('banking_finance', null)?.key).toBe('client_engagement')
  })

  it('advances sequentially through every stage to post_completion', () => {
    const order = [
      'client_engagement', 'term_sheet_review', 'due_diligence', 'facility_agreement_drafting',
      'security_documentation', 'regulatory_compliance_check', 'negotiation',
      'conditions_precedent', 'execution_drawdown', 'post_completion',
    ]
    let current: string | null = null
    for (const expected of order) {
      current = getNextStage('banking_finance', current)?.key ?? null
      expect(current).toBe(expected)
    }
    expect(getNextStage('banking_finance', current)).toBeNull()
  })
})

describe('Banking & Finance workflow API', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('BankingFinanceTenant')
    const client = await createTestClient(tenant, 'Banking Finance Client')
    const matter = await createTestMatter(tenant, client.id, 'Banking Finance Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('starts, advances through every stage, creates a drawdown deadline, and marks the matter completed', async () => {
    const start = await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'banking_finance' }),
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

    expect(await advance()).toBe('term_sheet_review')
    expect(await advance()).toBe('due_diligence')
    expect(await advance()).toBe('facility_agreement_drafting')
    expect(await advance()).toBe('security_documentation')
    expect(await advance()).toBe('regulatory_compliance_check')
    expect(await advance()).toBe('negotiation')
    expect(await advance()).toBe('conditions_precedent')
    expect(await advance()).toBe('execution_drawdown')

    const { data: events } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(events?.some((e) => e.title.includes('Drawdown date'))).toBe(true)

    expect(await advance()).toBe('post_completion')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)

    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', matterId)
    expect(tasks?.some((t) => t.title.startsWith('Client Engagement:'))).toBe(true)
    expect(tasks?.some((t) => t.title.startsWith('Post-Completion:'))).toBe(true)
  })
})
