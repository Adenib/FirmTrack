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

describe('Employment Law registry (pure)', () => {
  it('maps "Employment" law_type to the employment_law template', () => {
    expect(getTemplateForLawType('Employment')).toBe('employment_law')
  })

  it('has 8 stages, exactly one optional (Appeal, the last stage), starting at Employee Complaint', () => {
    const stages = getWorkflowStages('employment_law')
    expect(stages).toHaveLength(8)
    expect(stages?.filter((s) => s.optional).map((s) => s.key)).toEqual(['appeal'])
    expect(stages?.at(-1)?.key).toBe('appeal')
    expect(getNextStage('employment_law', null)?.key).toBe('employee_complaint')
  })

  it('a plain advance from Decision has nowhere mandatory to go (Appeal is the only, optional, follow-on)', () => {
    expect(getNextStage('employment_law', 'decision')).toBeNull()
  })

  it('Appeal is reachable only by explicit targeting', () => {
    expect(getNextStage('employment_law', 'decision', 'appeal')?.key).toBe('appeal')
    expect(getNextStage('employment_law', 'appeal')).toBeNull()
  })
})

describe('Employment Law workflow API', () => {
  let tenant: TestTenant
  let matterId: string
  let appealMatterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('EmploymentLawTenant')
    const client = await createTestClient(tenant, 'Employment Law Client')

    const matter = await createTestMatter(tenant, client.id, 'Employment Law Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id

    const appealMatter = await createTestMatter(tenant, client.id, 'Employment Law Appeal Path Matter', {
      responsible_lawyer: tenant.userId,
    })
    appealMatterId = appealMatter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('reaches Decision and closes the matter, with no further mandatory stage to advance to', async () => {
    await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'employment_law' }),
    })

    const advance = async () => {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId }),
      })
      expect(res.status).toBe(200)
      return (await res.json()).currentStage
    }

    expect(await advance()).toBe('case_assessment')
    expect(await advance()).toBe('internal_investigation')
    expect(await advance()).toBe('interviews')
    expect(await advance()).toBe('legal_opinion')
    expect(await advance()).toBe('disciplinary_hearing')

    const { data: events } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(events?.some((e) => e.title.includes('Disciplinary hearing'))).toBe(true)

    expect(await advance()).toBe('decision')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    // No mandatory stage follows Decision -- only the optional Appeal.
    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)
  })

  it('can explicitly enter Appeal from Decision, which also closes the matter', async () => {
    await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: appealMatterId, template: 'employment_law' }),
    })

    for (const stage of ['case_assessment', 'internal_investigation', 'interviews', 'legal_opinion', 'disciplinary_hearing', 'decision']) {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: appealMatterId }),
      })
      expect((await res.json()).currentStage).toBe(stage)
    }

    const appealRes = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: appealMatterId, to_stage: 'appeal' }),
    })
    expect((await appealRes.json()).currentStage).toBe('appeal')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', appealMatterId).single()
    expect(matterRow?.status).toBe('completed')

    const { data: tasks } = await supabaseAdmin.from('tasks').select('title').eq('matter_id', appealMatterId)
    expect(tasks?.some((t) => t.title.startsWith('Appeal:'))).toBe(true)
  })
})
