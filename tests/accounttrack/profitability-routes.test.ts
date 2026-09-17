import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter, createTestLawyer, createTestUser,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

function pad(n: number) { return String(n).padStart(2, '0') }
function iso(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }

describe('AccountTrack Profitability', () => {
  let tenant: TestTenant
  let clientId: string
  let matterId: string
  let lawyerId: string
  let categoryId: string
  let staffFetch: TestTenant['fetch']

  const today = new Date()
  const monthStart = iso(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthEnd = iso(new Date(today.getFullYear(), today.getMonth() + 1, 0))

  beforeAll(async () => {
    tenant = await createTestTenant('Profitability')

    const client = await createTestClient(tenant, 'Profitability Test Client')
    clientId = client.id

    const matter = await createTestMatter(tenant, clientId, 'Profitability Test Matter')
    matterId = matter.id

    const { data: category } = await supabaseAdmin
      .from('lawyer_categories')
      .insert({ tenant_id: tenant.tenantId, name: 'Partner', sort_order: 1 })
      .select()
      .single()
    categoryId = category.id

    const lawyer = await createTestLawyer(tenant, { nickname: 'PROF', initials: 'PT' })
    lawyerId = lawyer.id
    await supabaseAdmin.from('lawyers').update({ category_id: categoryId }).eq('id', lawyerId)

    const staff = await createTestUser(tenant, { role: 'staff' })
    staffFetch = staff.fetch

    // Set an internal cost rate for the category BEFORE logging time, so
    // the entries route can freeze internal_cost_amount on write.
    await tenant.fetch('/api/admin/internal-cost-rates', {
      method: 'POST',
      body: JSON.stringify({ category_id: categoryId, rate: 15000, currency: 'NGN', effective_from: monthStart }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  describe('auth and role gating', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await fetch(`http://localhost:3000/api/accounttrack/profitability/matter/${matterId}`)
      expect(res.status).toBe(401)
    })

    it('rejects a non-privileged role', async () => {
      const res = await staffFetch(`/api/accounttrack/profitability/matter/${matterId}`)
      expect(res.status).toBe(403)
    })

    it('404s a matter that does not belong to this tenant', async () => {
      const res = await tenant.fetch('/api/accounttrack/profitability/matter/00000000-0000-0000-0000-000000000000')
      expect(res.status).toBe(404)
    })
  })

  describe('internal cost rate resolution', () => {
    it('resolves a lawyer time entry against the category rate and freezes it on the entry', async () => {
      const res = await tenant.fetch('/api/timetrack/entries', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { matter_id: matterId, lawyer_id: lawyerId, entry_date: monthStart, hours: 10, rate: 50000, amount: 500000, billable: true },
          ],
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.entries[0].internal_cost_rate).toBeCloseTo(15000, 2)
      expect(body.entries[0].internal_cost_amount).toBeCloseTo(150000, 2) // 10 hours * 15,000/hr
    })

    it('does not retroactively change an already-frozen entry when a new rate is added later', async () => {
      // A rate effective far in the future must not affect the entry
      // created above (entry_date = monthStart).
      const futureDate = iso(new Date(today.getFullYear() + 1, 0, 1))
      await tenant.fetch('/api/admin/internal-cost-rates', {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId, rate: 99999, currency: 'NGN', effective_from: futureDate }),
      })

      const res = await tenant.fetch(`/api/timetrack/entries?matter_id=${matterId}`)
      const body = await res.json()
      const entry = body.entries.find((e: { hours: number }) => e.hours === 10)
      expect(entry.internal_cost_rate).toBeCloseTo(15000, 2)
    })
  })

  describe('matter profitability end-to-end', () => {
    let feeEntryId: string
    let writeOffEntryId: string

    beforeAll(async () => {
      // A second, larger entry that will actually get invoiced -- kept
      // separate from the frozen-rate entry above so this block's totals
      // are easy to hand-verify.
      const res = await tenant.fetch('/api/timetrack/entries', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { matter_id: matterId, lawyer_id: lawyerId, entry_date: monthStart, hours: 20, rate: 50000, amount: 1000000, billable: true },
            { matter_id: matterId, lawyer_id: lawyerId, entry_date: monthStart, hours: 4, rate: 50000, amount: 200000, billable: true },
          ],
        }),
      })
      const body = await res.json()
      feeEntryId = body.entries[0].id
      writeOffEntryId = body.entries[1].id

      // Write off part of the second entry before invoicing it.
      const writeOffRes = await tenant.fetch('/api/timetrack/entries', {
        method: 'PATCH',
        body: JSON.stringify({ id: writeOffEntryId, write_off_amount: 50000, write_off_reason: 'Client goodwill discount' }),
      })
      expect(writeOffRes.status).toBe(200)

      // A disbursement (matter expense).
      await tenant.fetch('/api/accounttrack/disbursements', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId, disb_date: monthStart, description: 'Filing fee', amount: 75000 }),
      })

      // A matter budget for the current period, deliberately set low so
      // actual hours exceed it (over-budget flag).
      await tenant.fetch('/api/accounttrack/budgets', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId, period_start: monthStart, period_end: monthEnd, target_hours: 5 }),
      })

      // Invoice the two fee entries (post-write-off amount actually billed).
      const invoiceRes = await tenant.fetch('/api/accounttrack/invoices', {
        method: 'POST',
        body: JSON.stringify({ matter_id: matterId, time_entry_ids: [feeEntryId, writeOffEntryId] }),
      })
      expect(invoiceRes.status).toBe(200)
      const invoiceBody = await invoiceRes.json()

      // Partially pay the invoice.
      await tenant.fetch('/api/accounttrack/invoices', {
        method: 'PATCH',
        body: JSON.stringify({ id: invoiceBody.invoice.id, payment_amount: Number(invoiceBody.invoice.total_amount) / 2 }),
      })
    })

    it('bills the invoice net of the write-off, not the full recorded amount', async () => {
      const res = await tenant.fetch(`/api/accounttrack/invoices?matter_id=${matterId}`)
      const body = await res.json()
      // 1,000,000 + (200,000 - 50,000 write-off) = 1,150,000. The
      // disbursement was never included in this invoice (no
      // disbursement_ids passed), so total_amount equals fees_amount alone
      // -- it still counts toward matter cost separately, checked below.
      expect(body.invoices[0].fees_amount).toBeCloseTo(1150000, 2)
      expect(body.invoices[0].total_amount).toBeCloseTo(1150000, 2)
    })

    it('returns matter profitability with correct revenue/cost/profit and timekeeper breakdown', async () => {
      const res = await tenant.fetch(`/api/accounttrack/profitability/matter/${matterId}`)
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.profitability.revenue).toBeCloseTo(1150000, 2)
      // Time cost: 10h + 20h + 4h = 34h * 15,000/hr = 510,000; plus 75,000 expense
      expect(body.profitability.cost.timeCost).toBeCloseTo(510000, 2)
      expect(body.profitability.cost.expenses).toBeCloseTo(75000, 2)
      expect(body.profitability.writeOffs).toBeCloseTo(50000, 2)

      const timekeeper = body.timekeepers.find((t: { lawyerId: string }) => t.lawyerId === lawyerId)
      expect(timekeeper).toBeTruthy()
      expect(timekeeper.hours).toBeCloseTo(34, 2)
      expect(timekeeper.category).toBe('Partner')
    })

    it('flags the matter as over budget and reports it in firmwide alerts', async () => {
      const res = await tenant.fetch(`/api/accounttrack/profitability/matter/${matterId}`)
      const body = await res.json()
      expect(body.profitability.flags.some((f: { type: string }) => f.type === 'over_budget')).toBe(true)

      const alertsRes = await tenant.fetch('/api/accounttrack/profitability/alerts')
      const alertsBody = await alertsRes.json()
      expect(alertsBody.alerts.some((a: { matterId: string; flag: { type: string } }) => a.matterId === matterId && a.flag.type === 'over_budget')).toBe(true)
    })

    it('rolls up client-level profitability across the client\'s matters', async () => {
      const res = await tenant.fetch(`/api/accounttrack/profitability/client/${clientId}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.rollup.revenue).toBeCloseTo(1150000, 2)
      expect(body.matters).toHaveLength(1)
    })

    it('rolls up team profitability grouped by responsible partner', async () => {
      const res = await tenant.fetch('/api/accounttrack/profitability/team?groupBy=responsible_lawyer')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.groups.length).toBeGreaterThan(0)
      const total = body.groups.reduce((s: number, g: { revenue: number }) => s + g.revenue, 0)
      expect(total).toBeCloseTo(1150000, 2)
    })

    it('exports a valid non-empty .xlsx workbook for the matter', async () => {
      const res = await tenant.fetch(`/api/accounttrack/profitability/export?matterId=${matterId}`)
      expect(res.status).toBe(200)
      const buf = Buffer.from(await res.arrayBuffer())
      expect(buf.length).toBeGreaterThan(0)

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buf as any)
      expect(workbook.getWorksheet('Summary')).toBeTruthy()
      expect(workbook.getWorksheet('Timekeepers')).toBeTruthy()
    })

    it('exports a valid workbook for the client', async () => {
      const res = await tenant.fetch(`/api/accounttrack/profitability/export?clientId=${clientId}`)
      expect(res.status).toBe(200)
      const buf = Buffer.from(await res.arrayBuffer())
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buf as any)
      expect(workbook.getWorksheet('Matters')).toBeTruthy()
    })

    it('returns a monthly trend for the matter', async () => {
      const res = await tenant.fetch(`/api/accounttrack/profitability/trend?matterId=${matterId}&groupBy=month`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.trend.length).toBeGreaterThan(0)
    })
  })
})
