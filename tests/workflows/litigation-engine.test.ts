import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { getNextStage } from '@/lib/workflows/registry'
import {
  createTestTenant,
  destroyTestTenant,
  createTestClient,
  createTestMatter,
  createTestUser,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

describe('getNextStage (pure)', () => {
  it('starts at the first stage when currentStage is null', () => {
    expect(getNextStage('litigation', null)?.key).toBe('client_onboarding')
  })

  it('advances sequentially through non-optional stages', () => {
    expect(getNextStage('litigation', 'client_onboarding')?.key).toBe('engagement_letter')
    expect(getNextStage('litigation', 'engagement_letter')?.key).toBe('retainer_payment')
  })

  it('skips the optional Appeal stage unless explicitly targeted', () => {
    expect(getNextStage('litigation', 'judgment')?.key).toBe('matter_closed')
  })

  it('allows explicitly targeting the Appeal stage via to_stage', () => {
    expect(getNextStage('litigation', 'judgment', 'appeal')?.key).toBe('appeal')
    expect(getNextStage('litigation', 'appeal')?.key).toBe('matter_closed')
  })

  it('returns null past the last stage', () => {
    expect(getNextStage('litigation', 'matter_closed')).toBeNull()
  })

  it('returns null for an unknown template', () => {
    expect(getNextStage('not-a-real-template', null)).toBeNull()
  })
})

describe('Litigation workflow API', () => {
  let tenant: TestTenant
  let unassignedStaff: TestTenant
  let assignedStaff: TestTenant
  let matterId: string
  let assignedMatterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('LitigationWorkflowTenant')
    unassignedStaff = await createTestUser(tenant, { role: 'staff' })
    assignedStaff = await createTestUser(tenant, { role: 'staff' })

    const client = await createTestClient(tenant, 'Litigation Workflow Client')
    const matter = await createTestMatter(tenant, client.id, 'Workflow Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id

    const assignedMatter = await createTestMatter(tenant, client.id, 'Assigned Staff Matter', {
      responsible_lawyer: assignedStaff.userId,
    })
    assignedMatterId = assignedMatter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [unassignedStaff.userId, assignedStaff.userId])
  })

  it('requires authentication and matter-level authorization', async () => {
    const unauthedRes = await fetch(`http://localhost:3000/api/admin/matters/workflow?matter_id=${matterId}`)
    expect(unauthedRes.status).toBe(401)

    const forbiddenRes = await unassignedStaff.fetch(`/api/admin/matters/workflow?matter_id=${matterId}`)
    expect(forbiddenRes.status).toBe(403)

    // The matter's own responsible_lawyer can access it even as plain staff.
    const assignedRes = await assignedStaff.fetch(`/api/admin/matters/workflow?matter_id=${assignedMatterId}`)
    expect(assignedRes.status).toBe(200)
  })

  it('has no workflow before one is started', async () => {
    const res = await tenant.fetch(`/api/admin/matters/workflow?matter_id=${matterId}`)
    const body = await res.json()
    expect(body.template).toBeNull()
    expect(body.currentStage).toBeNull()
    expect(body.stages).toEqual([])
  })

  it('starts the workflow, generating stage tasks and a history entry', async () => {
    const res = await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'litigation' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.currentStage).toBe('client_onboarding')

    const { data: tasks } = await supabaseAdmin.from('tasks').select('*').eq('matter_id', matterId)
    expect(tasks?.length).toBe(2)
    expect(tasks?.every((t) => t.title.startsWith('Client Onboarding:'))).toBe(true)

    const { data: history } = await supabaseAdmin
      .from('matter_workflow_history')
      .select('*')
      .eq('matter_id', matterId)
    expect(history?.length).toBe(1)
    expect(history?.[0].from_stage).toBeNull()
    expect(history?.[0].to_stage).toBe('client_onboarding')
  })

  it('rejects starting a workflow twice', async () => {
    const res = await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, template: 'litigation' }),
    })
    expect(res.status).toBe(400)
  })

  it('advances through stages, creates a deadline event at file_in_court, skips Appeal by default, and closes the matter', async () => {
    const advance = async (toStage?: string) => {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId, to_stage: toStage }),
      })
      expect(res.status).toBe(200)
      return res.json()
    }

    expect((await advance()).currentStage).toBe('engagement_letter')
    expect((await advance()).currentStage).toBe('retainer_payment')
    expect((await advance()).currentStage).toBe('assign_legal_team')
    expect((await advance()).currentStage).toBe('create_matter_folder')
    expect((await advance()).currentStage).toBe('prepare_pleadings')
    expect((await advance()).currentStage).toBe('file_in_court')

    const { data: events } = await supabaseAdmin
      .from('ft_calendar_events')
      .select('*')
      .eq('linked_module', 'matters')
      .eq('linked_id', matterId)
    expect(events?.some((e) => e.title.includes('Court filing deadline'))).toBe(true)

    expect((await advance()).currentStage).toBe('court_appearance')
    expect((await advance()).currentStage).toBe('judgment')

    // Default advance skips the optional Appeal stage entirely.
    const closed = await advance()
    expect(closed.currentStage).toBe('matter_closed')

    const { data: matterRow } = await supabaseAdmin.from('matters').select('status').eq('id', matterId).single()
    expect(matterRow?.status).toBe('completed')

    const noFurther = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId }),
    })
    expect(noFurther.status).toBe(400)
  })

  it('can explicitly target the optional Appeal stage', async () => {
    const client = await createTestClient(tenant, 'Appeal Path Client')
    const matter = await createTestMatter(tenant, client.id, 'Appeal Path Matter', {
      responsible_lawyer: tenant.userId,
    })

    await tenant.fetch('/api/admin/matters/workflow', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, template: 'litigation' }),
    })

    const stages = [
      'engagement_letter',
      'retainer_payment',
      'assign_legal_team',
      'create_matter_folder',
      'prepare_pleadings',
      'file_in_court',
      'court_appearance',
      'judgment',
    ]
    for (const stage of stages) {
      const res = await tenant.fetch('/api/admin/matters/workflow/advance', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matter.id }),
      })
      const body = await res.json()
      expect(body.currentStage).toBe(stage)
    }

    const appealRes = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, to_stage: 'appeal' }),
    })
    expect((await appealRes.json()).currentStage).toBe('appeal')

    const closedRes = await tenant.fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id }),
    })
    expect((await closedRes.json()).currentStage).toBe('matter_closed')
  })
})
