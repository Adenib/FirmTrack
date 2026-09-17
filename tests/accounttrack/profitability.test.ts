import { describe, it, expect } from 'vitest'
import {
  computeMatterProfitability, rollupClientProfitability, rollupTimekeeperProfitability, computeTrend,
  flagOverBudget, flagExcessivePartnerTime, flagSignificantWriteOffs, flagAgedInvoices,
  type TimeEntryForProfitability, type DisbursementForProfitability, type InvoiceForProfitability,
} from '../../src/lib/accounttrack/profitability'

describe('computeMatterProfitability', () => {
  it('matches the feature spec worked example exactly', () => {
    const timeEntries: TimeEntryForProfitability[] = [
      { lawyer_id: 'lw1', hours: 200, amount: 10_000_000, billable: true, status: 'billed', entry_date: '2026-01-05', write_off_amount: 0, internal_cost_amount: 3_000_000, lawyer_category: 'Partner' },
    ]
    const disbursements: DisbursementForProfitability[] = [{ amount: 500_000, billed: true }]
    const invoices: InvoiceForProfitability[] = [
      { fees_amount: 10_000_000, disbursements_amount: 500_000, total_amount: 10_500_000, paid_amount: 8_400_000, status: 'partially_paid', due_date: '2026-01-20', invoice_date: '2026-01-06' },
    ]

    const result = computeMatterProfitability({ timeEntries, disbursements, invoices, asOfDate: new Date('2026-02-01') })

    expect(result.revenue).toBe(10_000_000)
    expect(result.cost).toEqual({ timeCost: 3_000_000, expenses: 500_000, total: 3_500_000 })
    expect(result.profit).toBe(6_500_000)
    expect(result.marginPct).toBeCloseTo(0.65, 5)
    // 8,400,000 paid on a 10,500,000 invoice where fees are 10,000,000 of
    // that total -> fees collected = 8,400,000 * (10,000,000/10,500,000) = 8,000,000
    expect(result.feesCollected).toBeCloseTo(8_000_000, 2)
    expect(result.collectionRate).toBeCloseTo(0.8, 5)
  })

  it('computes realisation rate as invoiced (post-write-off) value over recorded billable value', () => {
    const timeEntries: TimeEntryForProfitability[] = [
      { lawyer_id: 'lw1', hours: 10, amount: 100_000, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 20_000, internal_cost_amount: 30_000 },
      { lawyer_id: 'lw1', hours: 5, amount: 50_000, billable: true, status: 'submitted', entry_date: '2026-01-10', write_off_amount: 0, internal_cost_amount: 15_000 },
    ]
    const result = computeMatterProfitability({ timeEntries, disbursements: [], invoices: [] })

    expect(result.recordedBillableValue).toBe(150_000)
    expect(result.invoicedBillableValue).toBe(80_000) // 100,000 - 20,000 write-off
    expect(result.realisationRate).toBeCloseTo(80_000 / 150_000, 5)
    expect(result.wip).toBe(50_000) // the unbilled (submitted) entry
  })

  it('reports missing internal cost rate entries instead of silently costing them at 0', () => {
    const timeEntries: TimeEntryForProfitability[] = [
      { lawyer_id: 'lw1', hours: 5, amount: 50_000, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: null },
    ]
    const result = computeMatterProfitability({ timeEntries, disbursements: [], invoices: [] })
    expect(result.missingCostRateEntryCount).toBe(1)
    expect(result.cost.timeCost).toBe(0)
  })

  it('returns null margin/collection/realisation rates rather than dividing by zero', () => {
    const result = computeMatterProfitability({ timeEntries: [], disbursements: [], invoices: [] })
    expect(result.marginPct).toBeNull()
    expect(result.collectionRate).toBeNull()
    expect(result.realisationRate).toBeNull()
  })
})

describe('flags', () => {
  it('flagOverBudget fires only when the comparison says over budget', () => {
    expect(flagOverBudget(null)).toHaveLength(0)
    expect(flagOverBudget({ targetHours: 10, actualHours: 5, targetBillableHours: null, actualBillableHours: 5, targetCost: null, actualCost: 0, overBudget: false })).toHaveLength(0)
    expect(flagOverBudget({ targetHours: 10, actualHours: 15, targetBillableHours: null, actualBillableHours: 15, targetCost: null, actualCost: 0, overBudget: true })).toHaveLength(1)
  })

  it('flagExcessivePartnerTime fires above the threshold and stays silent below it', () => {
    const heavy: TimeEntryForProfitability[] = [
      { lawyer_id: 'p1', hours: 8, amount: 0, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 0, lawyer_category: 'Partner' },
      { lawyer_id: 'a1', hours: 2, amount: 0, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 0, lawyer_category: 'Associate' },
    ]
    expect(flagExcessivePartnerTime(heavy)).toHaveLength(1)

    const light: TimeEntryForProfitability[] = [
      { lawyer_id: 'p1', hours: 2, amount: 0, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 0, lawyer_category: 'Partner' },
      { lawyer_id: 'a1', hours: 8, amount: 0, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 0, lawyer_category: 'Associate' },
    ]
    expect(flagExcessivePartnerTime(light)).toHaveLength(0)
  })

  it('flagSignificantWriteOffs fires above the threshold', () => {
    expect(flagSignificantWriteOffs(20_000, 100_000)).toHaveLength(1) // 20%
    expect(flagSignificantWriteOffs(5_000, 100_000)).toHaveLength(0) // 5%
    expect(flagSignificantWriteOffs(0, 0)).toHaveLength(0)
  })

  it('flagAgedInvoices fires only for open/partially_paid invoices overdue past the threshold', () => {
    const asOf = new Date('2026-03-01')
    const aged: InvoiceForProfitability[] = [
      { fees_amount: 100, disbursements_amount: 0, total_amount: 100, paid_amount: 0, status: 'open', due_date: '2026-01-01', invoice_date: '2025-12-01' },
    ]
    expect(flagAgedInvoices(aged, asOf)).toHaveLength(1)

    const paid: InvoiceForProfitability[] = [
      { fees_amount: 100, disbursements_amount: 0, total_amount: 100, paid_amount: 100, status: 'paid', due_date: '2026-01-01', invoice_date: '2025-12-01' },
    ]
    expect(flagAgedInvoices(paid, asOf)).toHaveLength(0)

    const notYetDue: InvoiceForProfitability[] = [
      { fees_amount: 100, disbursements_amount: 0, total_amount: 100, paid_amount: 0, status: 'open', due_date: '2026-02-20', invoice_date: '2026-01-20' },
    ]
    expect(flagAgedInvoices(notYetDue, asOf)).toHaveLength(0)
  })
})

describe('rollupClientProfitability', () => {
  it('aggregates revenue, cost, and profit across matters', () => {
    const m1 = computeMatterProfitability({
      timeEntries: [{ lawyer_id: 'l1', hours: 10, amount: 100_000, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 30_000 }],
      disbursements: [], invoices: [{ fees_amount: 100_000, disbursements_amount: 0, total_amount: 100_000, paid_amount: 100_000, status: 'paid', due_date: null, invoice_date: '2026-01-01' }],
    })
    const m2 = computeMatterProfitability({
      timeEntries: [{ lawyer_id: 'l1', hours: 5, amount: 50_000, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 10_000 }],
      disbursements: [], invoices: [{ fees_amount: 50_000, disbursements_amount: 0, total_amount: 50_000, paid_amount: 25_000, status: 'partially_paid', due_date: null, invoice_date: '2026-01-01' }],
    })

    const rollup = rollupClientProfitability([{ matterId: 'm1', profitability: m1 }, { matterId: 'm2', profitability: m2 }])

    expect(rollup.revenue).toBe(150_000)
    expect(rollup.cost.total).toBe(40_000)
    expect(rollup.profit).toBe(110_000)
    expect(rollup.feesCollected).toBeCloseTo(125_000, 2)
  })
})

describe('rollupTimekeeperProfitability', () => {
  it('sums hours, revenue, and internal cost per lawyer', () => {
    const entries: TimeEntryForProfitability[] = [
      { lawyer_id: 'l1', hours: 5, amount: 50_000, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 10_000, lawyer_category: 'Partner' },
      { lawyer_id: 'l1', hours: 3, amount: 30_000, billable: true, status: 'billed', entry_date: '2026-01-02', write_off_amount: 0, internal_cost_amount: 6_000, lawyer_category: 'Partner' },
      { lawyer_id: 'l2', hours: 4, amount: 20_000, billable: true, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 8_000, lawyer_category: 'Associate' },
      { lawyer_id: 'l2', hours: 2, amount: 0, billable: false, status: 'billed', entry_date: '2026-01-01', write_off_amount: 0, internal_cost_amount: 4_000, lawyer_category: 'Associate' },
    ]

    const rows = rollupTimekeeperProfitability(entries)
    const l1 = rows.find((r) => r.lawyerId === 'l1')!
    const l2 = rows.find((r) => r.lawyerId === 'l2')!

    expect(l1.hours).toBe(8)
    expect(l1.revenue).toBe(80_000)
    expect(l1.internalCost).toBe(16_000)
    expect(l1.profitContribution).toBe(64_000)

    expect(l2.hours).toBe(6)
    expect(l2.billableHours).toBe(4)
    expect(l2.revenue).toBe(20_000)
    expect(l2.internalCost).toBe(12_000)
  })
})

describe('computeTrend', () => {
  it('buckets by month and computes profitability per bucket', () => {
    const timeEntries: TimeEntryForProfitability[] = [
      { lawyer_id: 'l1', hours: 5, amount: 50_000, billable: true, status: 'billed', entry_date: '2026-01-15', write_off_amount: 0, internal_cost_amount: 10_000 },
      { lawyer_id: 'l1', hours: 5, amount: 50_000, billable: true, status: 'billed', entry_date: '2026-02-15', write_off_amount: 0, internal_cost_amount: 10_000 },
    ]
    const invoices: (InvoiceForProfitability & { invoice_date: string })[] = [
      { fees_amount: 50_000, disbursements_amount: 0, total_amount: 50_000, paid_amount: 50_000, status: 'paid', due_date: null, invoice_date: '2026-01-16' },
      { fees_amount: 50_000, disbursements_amount: 0, total_amount: 50_000, paid_amount: 50_000, status: 'paid', due_date: null, invoice_date: '2026-02-16' },
    ]

    const buckets = computeTrend({ timeEntries, disbursements: [], invoices, groupBy: 'month' })

    expect(buckets.map((b) => b.period)).toEqual(['2026-01', '2026-02'])
    expect(buckets[0].profitability.revenue).toBe(50_000)
    expect(buckets[0].profitability.cost.timeCost).toBe(10_000)
    expect(buckets[1].profitability.revenue).toBe(50_000)
  })
})
