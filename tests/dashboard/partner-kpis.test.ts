import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  destroyTestTenant,
  createTestClient,
  createTestMatter,
  createTestLawyer,
  createTestUser,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

describe('Partner KPI dashboard', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let matterId: string
  let lawyerId: string

  beforeAll(async () => {
    tenant = await createTestTenant('PartnerKpiTenant')
    await supabaseAdmin.from('subscriptions').insert([
      { tenant_id: tenant.tenantId, module: 'accounttrack', tier: 'free', is_active: true, price_per_user: 0 },
    ])
    staff = await createTestUser(tenant, { role: 'staff' })

    const client = await createTestClient(tenant, 'KPI Test Client')
    const lawyer = await createTestLawyer(tenant, { nickname: 'KPI', initials: 'KPI' })
    lawyerId = lawyer.id
    const matter = await createTestMatter(tenant, client.id, 'KPI Test Matter', { responsible_lawyer: tenant.userId })
    matterId = matter.id

    // Billable + non-billable time this month.
    const today = new Date().toISOString().split('T')[0]
    const entriesRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { matter_id: matterId, lawyer_id: lawyerId, entry_date: today, hours: 6, rate_usd: 100, amount_usd: 600, billable: true },
          { matter_id: matterId, lawyer_id: lawyerId, entry_date: today, hours: 2, rate_usd: 100, amount_usd: 0, billable: false },
        ],
      }),
    })
    const { entries } = await entriesRes.json()

    // Invoice + partial payment -- exercises invoiced/collected/outstanding.
    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, time_entry_ids: [entries[0].id] }),
    })
    const { invoice } = await invRes.json()
    await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoice.id, payment_amount_usd: 250 }),
    })

    // Trust deposit -- exercises the trust balance.
    await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, ledger_type: 'trust', amount_usd: 5000, description: 'Retainer deposit' }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('GET /api/dashboard/kpis requires authentication and owner/admin role', async () => {
    const unauthedRes = await fetch('http://localhost:3000/api/dashboard/kpis')
    expect(unauthedRes.status).toBe(401)

    const staffRes = await staff.fetch('/api/dashboard/kpis')
    expect(staffRes.status).toBe(403)
  })

  it('computes billing, trust, productivity, and matters for an owner', async () => {
    const res = await tenant.fetch('/api/dashboard/kpis')
    expect(res.status).toBe(200)
    const kpis = await res.json()

    expect(kpis.billing.invoicedUsd).toBe(600)
    expect(kpis.billing.collectedUsd).toBe(250)
    expect(kpis.billing.outstandingUsd).toBe(350)

    expect(kpis.trust.balanceUsd).toBe(5000)

    expect(kpis.productivity.billableHours).toBe(6)
    expect(kpis.productivity.totalHours).toBe(8)
    expect(kpis.productivity.avgUtilization).toBeCloseTo(0.75, 5)

    expect(kpis.matters.active).toBeGreaterThanOrEqual(1)
    expect(kpis.matters.newThisMonth).toBeGreaterThanOrEqual(1)

    expect(kpis.topClients.some((c: { clientName: string }) => c.clientName === 'KPI Test Client')).toBe(true)
  })

  it('returns a null trust section when accounttrack is not active, without erroring', async () => {
    const bareTenant = await createTestTenant('BareKpiTenant')
    // createTestTenant grants accounttrack to every tenant it creates as a
    // matter of general test convenience (see its own comment) -- deactivate
    // it here to genuinely exercise the "module not active" branch.
    await supabaseAdmin
      .from('subscriptions')
      .update({ is_active: false })
      .eq('tenant_id', bareTenant.tenantId)
      .eq('module', 'accounttrack')
    try {
      const res = await bareTenant.fetch('/api/dashboard/kpis')
      expect(res.status).toBe(200)
      const kpis = await res.json()
      // /api/register's free-tier defaults include timetrack and billtrack
      // (see freeModules in that route), so those sections are present --
      // just zeroed out. Only accounttrack (trust) needs an explicit
      // subscription this tenant never got.
      expect(kpis.trust).toBeNull()
      expect(kpis.billing).toEqual({ invoicedUsd: 0, collectedUsd: 0, outstandingUsd: 0 })
      expect(kpis.productivity).toEqual({ billableHours: 0, totalHours: 0, avgUtilization: null })
      expect(kpis.topClients).toEqual([])
      expect(kpis.matters).toEqual({ active: 0, newThisMonth: 0 })
    } finally {
      await destroyTestTenant(bareTenant)
    }
  })
})
