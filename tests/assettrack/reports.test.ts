import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

describe('AssetTrack reports', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let assetA: string
  let assetB: string // the repeat-fault / retirement-candidate asset

  beforeAll(async () => {
    tenant = await createTestTenant('AssetTrackReports')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'assettrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })
    staff = await createTestUser(tenant, { role: 'staff' })

    const assetARes = await tenant.fetch('/api/assettrack/assets', {
      method: 'POST',
      body: JSON.stringify({ asset_tag: 'RPT-A', purchase_date: '2026-01-01' }), // new
    })
    assetA = (await assetARes.json()).asset.id

    const assetBRes = await tenant.fetch('/api/assettrack/assets', {
      method: 'POST',
      body: JSON.stringify({ asset_tag: 'RPT-B', purchase_date: '2018-01-01' }), // old -- retirement candidate
    })
    assetB = (await assetBRes.json()).asset.id

    // Ticket 1 on asset A: closed+confirmed, internal repair, cost 20000, category hardware.
    const t1Res = await staff.fetch('/api/assettrack/tickets', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetA, category: 'hardware', issue_description: 'Keyboard sticking on several keys.' }),
    })
    const t1 = (await t1Res.json()).ticket
    await tenant.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: t1.id, status: 'triage', estimated_repair_cost: 20000, estimated_replacement_cost: 500000 }),
    })
    await tenant.fetch('/api/assettrack/tickets', { method: 'PATCH', body: JSON.stringify({ id: t1.id, decision: 'repair' }) })
    await tenant.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: t1.id, status: 'returned', resolution_notes: 'Cleaned and tested.' }),
    })
    await staff.fetch('/api/assettrack/tickets', { method: 'PATCH', body: JSON.stringify({ id: t1.id, user_confirmed: true }) })

    // Ticket 2 on asset B: vendor repair via MANIFOLD, cost 60000, category hardware, still open (triage) -- also makes B a repeat fault with ticket 3.
    const t2Res = await staff.fetch('/api/assettrack/tickets', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetB, category: 'hardware', issue_description: 'Motherboard issue, intermittent shutdown.' }),
    })
    const t2 = (await t2Res.json()).ticket
    await tenant.fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: t2.id, status: 'triage', estimated_repair_cost: 60000, vendor_name: 'MANIFOLD', decision: 'repair' }),
    })

    // Ticket 3 on asset B: a second ticket, still 'submitted' -- makes B a repeat fault (2 tickets) without needing a decision.
    await staff.fetch('/api/assettrack/tickets', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetB, category: 'software', issue_description: 'Blue screen on startup, second occurrence.' }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('requires IT staff access, not just module access', async () => {
    const nonStaff = await createTestUser(tenant, { role: 'staff' })
    const res = await nonStaff.fetch('/api/assettrack/reports')
    expect(res.status).toBe(403)
    await supabaseAdmin.auth.admin.deleteUser(nonStaff.userId).catch(() => {})
  })

  it('counts open tickets by status correctly', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    // t1 is closed (not open). t2 is 'triage'. The plain t3 is 'submitted'.
    expect(body.openByStatus.triage).toBe(1)
    expect(body.openByStatus.submitted).toBe(1)
    expect(body.openByStatus.closed).toBeUndefined()
  })

  it('sums repair expenditure by category', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    // 20000 (t1, hardware) + 60000 (t2, hardware) = 80000.
    expect(body.expenditureByCategory.hardware).toBe(80000)
  })

  it('sums repair expenditure by vendor', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    expect(body.expenditureByVendor.MANIFOLD).toBe(60000)
  })

  it('splits internal vs vendor repair counts', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    expect(body.internalRepairCount).toBe(1) // t1, no vendor
    expect(body.vendorRepairCount).toBe(1) // t2, MANIFOLD
  })

  it('flags asset B as a repeat fault with 2 tickets', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    const repeat = body.repeatFaults.find((r: { assetTag: string }) => r.assetTag === 'RPT-B')
    expect(repeat).toBeDefined()
    expect(repeat.ticketCount).toBe(2)
    expect(body.repeatFaults.some((r: { assetTag: string }) => r.assetTag === 'RPT-A')).toBe(false)
  })

  it('flags the pre-2023 asset as a retirement candidate and not the recent one', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    expect(body.retirementCandidates.some((a: { assetTag: string }) => a.assetTag === 'RPT-B')).toBe(true)
    expect(body.retirementCandidates.some((a: { assetTag: string }) => a.assetTag === 'RPT-A')).toBe(false)
  })

  it('computes a positive average turnaround from the one confirmed-closed ticket', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    expect(body.avgTurnaroundDays).not.toBeNull()
    expect(body.avgTurnaroundDays).toBeGreaterThanOrEqual(0)
  })

  it('respects the default 14-day SLA when nothing is configured', async () => {
    const res = await tenant.fetch('/api/assettrack/reports')
    const body = await res.json()
    expect(body.slaDays).toBe(14)
    // Tickets created moments ago can't be overdue against a 14-day SLA.
    expect(body.overdueTickets).toHaveLength(0)
  })
})
