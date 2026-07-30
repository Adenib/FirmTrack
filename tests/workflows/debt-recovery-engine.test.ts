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

describe('Debt Recovery registry (pure)', () => {
  it('maps "Debt Recovery" law_type to the debt_recovery template', () => {
    expect(getTemplateForLawType('Debt Recovery')).toBe('debt_recovery')
  })

  it('has 8 stages, exactly one optional (Litigation), starting at Client Instruction', () => {
    const stages = getWorkflowStages('debt_recovery')
    expect(stages).toHaveLength(8)
    expect(stages?.filter((s) => s.optional).map((s) => s.key)).toEqual(['litigation'])
    expect(getNextStage('debt_recovery', null)?.key).toBe('client_instruction')
  })

  it('a plain advance from settlement skips Litigation straight to Judgment', () => {
    expect(getNextStage('debt_recovery', 'settlement')?.key).toBe('judgment')
  })

  it('Litigation is reachable only by explicit targeting, then Judgment/Enforcement follow normally', () => {
    expect(getNextStage('debt_recovery', 'settlement', 'litigation')?.key).toBe('litigation')
    expect(getNextStage('debt_recovery', 'litigation')?.key).toBe('judgment')
    expect(getNextStage('debt_recovery', 'judgment')?.key).toBe('enforcement')
    expect(getNextStage('debt_recovery', 'enforcement')).toBeNull()
  })
})

describe('Debt Recovery workflow API', () => {
  let tenant: TestTenant
  let matterId: string
  let litigationMatterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('DebtRecoveryTenant')
    const client = await createTestClient(tenant, 'Debt Recovery Client')

    const matter = await createTestMatter(tenant, client.id, 'Debt Recovery Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id

    const litigationMatter = await createTestMatter(tenant, client.id, 'Debt Recovery Litigation Path Matter', {
      responsible_lawyer: tenant.userId,
    })
    litigationMatterId = litigationMatter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('settles without ever touching Litigation, and a plain advance skips straight to Judgment', async () => {
    await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'debt_recovery' }),
    })

    const advance = async (toStage?: string) => {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId, to_stage: toStage }),
      })
      expect(res.status).toBe(200)
      return (await res.json()).currentStage
    }

    expect(await advance()).toBe('demand_letter')
    expect(await advance()).toBe('payment_reminder')

    const { data: events } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(events?.some((e) => e.title.includes('Payment reminder follow-up'))).toBe(true)

    expect(await advance()).toBe('negotiation')
    expect(await advance()).toBe('settlement')
    // Plain advance from settlement skips the optional Litigation stage.
    expect(await advance()).toBe('judgment')
    expect(await advance()).toBe('enforcement')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    // Litigation's own tasks were never created since it was skipped.
    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', matterId)
    expect(tasks?.some((t) => t.title.startsWith('Litigation:'))).toBe(false)
    expect(tasks?.some((t) => t.title.startsWith('Enforcement:'))).toBe(true)
  })

  it('can explicitly enter Litigation from Settlement, and Judgment/Enforcement follow normally', async () => {
    await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: litigationMatterId, template: 'debt_recovery' }),
    })

    const stages = ['demand_letter', 'payment_reminder', 'negotiation', 'settlement']
    for (const stage of stages) {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: litigationMatterId }),
      })
      expect((await res.json()).currentStage).toBe(stage)
    }

    const litigationRes = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: litigationMatterId, to_stage: 'litigation' }),
    })
    expect((await litigationRes.json()).currentStage).toBe('litigation')

    const judgmentRes = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: litigationMatterId }),
    })
    expect((await judgmentRes.json()).currentStage).toBe('judgment')

    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', litigationMatterId)
    expect(tasks?.some((t) => t.title.startsWith('Litigation:'))).toBe(true)
  })
})
