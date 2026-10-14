import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('AssetTrack tickets', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let manager: TestTenant
  let assetId: string

  beforeAll(async () => {
    tenant = await createTestTenant('AssetTrackTickets')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'assettrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })

    staff = await createTestUser(tenant, { role: 'staff' })
    manager = await createTestUser(tenant, { role: 'manager' })

    const assetRes = await tenant.fetch('/api/assettrack/assets', {
      method: 'POST',
      body: JSON.stringify({ asset_tag: 'AT-TEST-001', make: 'Dell', model: 'Latitude 5420', replacement_cost: 500000 }),
    })
    const assetBody = await assetRes.json()
    assetId = assetBody.asset.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId, manager.userId])
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/assettrack/tickets`)
    expect(res.status).toBe(401)
  })

  it('403s when the module is not active for the tenant', async () => {
    const otherTenant = await createTestTenant('AssetTrackNoModule')
    const res = await otherTenant.fetch('/api/assettrack/tickets')
    expect(res.status).toBe(403)
    await destroyTestTenant(otherTenant)
  })

  let ticketId: string

  it('a non-staff employee can submit a ticket', async () => {
    const res = await staff.fetch('/api/assettrack/tickets', {
      method: 'POST',
      body: JSON.stringify({
        asset_id: assetId,
        category: 'hardware',
        impact: 'high',
        issue_description: 'Screen flickers constantly, even on battery.',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ticket.status).toBe('submitted')
    ticketId = body.ticket.id
  })

  it('creating a ticket logs exactly one "created" event', async () => {
    const res = await tenant.fetch(`/api/assettrack/tickets?id=${ticketId}`)
    const body = await res.json()
    expect(body.events).toHaveLength(1)
    expect(body.events[0].event_type).toBe('created')
  })

  it('a non-staff caller cannot change ticket status', async () => {
    const res = await staff.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticketId, status: 'triage' }),
    })
    expect(res.status).toBe(403)
  })

  it('cost and vendor fields are stripped from a non-staff caller\'s own ticket', async () => {
    await manager.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticketId, status: 'triage', estimated_repair_cost: 50000, estimated_replacement_cost: 500000, vendor_name: 'MANIFOLD' }),
    })

    const res = await staff.fetch(`/api/assettrack/tickets?id=${ticketId}`)
    const body = await res.json()
    expect(body.ticket.estimated_repair_cost).toBeUndefined()
    expect(body.ticket.vendor_name).toBeUndefined()
    expect(body.ticket.status).toBe('triage')
  })

  it('staff (manager) can see the full ticket including cost and vendor', async () => {
    const res = await manager.fetch(`/api/assettrack/tickets?id=${ticketId}`)
    const body = await res.json()
    expect(body.ticket.estimated_repair_cost).toBe(50000)
    expect(body.ticket.vendor_name).toBe('MANIFOLD')
  })

  it('moving a ticket to triage flips its linked asset to in_repair', async () => {
    const res = await tenant.fetch('/api/assettrack/assets')
    const body = await res.json()
    const asset = body.assets.find((a: { id: string }) => a.id === assetId)
    expect(asset.asset_status).toBe('in_repair')
  })

  it('recording a decision returns an advisory cost-ratio recommendation without blocking it', async () => {
    const res = await manager.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticketId, decision: 'repair' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    // 50000 / 500000 = 10% -> repair_review, well within policy -- and the
    // decision above is accepted either way, since this is advisory only.
    expect(body.assessment.recommendation).toBe('repair_review')
    expect(body.ticket.decision).toBe('repair')
  })

  it('marking a ticket returned requires resolution_notes', async () => {
    const res = await manager.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticketId, status: 'returned' }),
    })
    expect(res.status).toBe(400)
  })

  it('marking a ticket returned with resolution_notes succeeds and flips the asset back to active', async () => {
    const res = await manager.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticketId, status: 'returned', resolution_notes: 'Replaced the display cable.' }),
    })
    expect(res.status).toBe(200)

    const assetsRes = await tenant.fetch('/api/assettrack/assets')
    const assetsBody = await assetsRes.json()
    const asset = assetsBody.assets.find((a: { id: string }) => a.id === assetId)
    expect(asset.asset_status).toBe('active')
  })

  it('a manager cannot confirm receipt on the employee\'s behalf', async () => {
    const res = await manager.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticketId, user_confirmed: true }),
    })
    expect(res.status).toBe(403)
  })

  it('the reporting employee confirms receipt, which closes the ticket', async () => {
    const res = await staff.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticketId, user_confirmed: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticket.status).toBe('closed')
  })

  it('the full event history reflects every transition, one event per update', async () => {
    const res = await tenant.fetch(`/api/assettrack/tickets?id=${ticketId}`)
    const body = await res.json()
    const types = body.events.map((e: { event_type: string }) => e.event_type)
    expect(types).toEqual(['created', 'triaged', 'decision_recorded', 'returned_to_employee', 'confirmed_by_employee'])
  })

  it('a staff member can cancel their own still-open ticket', async () => {
    const createRes = await staff.fetch('/api/assettrack/tickets', {
      method: 'POST',
      body: JSON.stringify({ category: 'software', issue_description: 'Windows update loop on startup.' }),
    })
    const { ticket } = await createRes.json()

    const cancelRes = await staff.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: ticket.id, status: 'cancelled' }),
    })
    expect(cancelRes.status).toBe(200)
    const body = await cancelRes.json()
    expect(body.ticket.status).toBe('cancelled')
  })
})
