// Pure profitability calculation engine -- no DB calls, so it can be
// unit-tested directly against the feature spec's worked example. Callers
// (src/lib/accounttrack/load-matter-profitability.ts) fetch and shape rows,
// then hand them here.

export const PARTNER_TIME_THRESHOLD_PCT = 0.4
export const WRITE_OFF_THRESHOLD_PCT = 0.1
export const AGED_INVOICE_DAYS = 30

export type TimeEntryForProfitability = {
  id?: string
  lawyer_id: string | null
  hours: number | null
  amount: number | null
  billable: boolean
  status: string
  entry_date: string
  write_off_amount: number
  internal_cost_amount: number | null
  lawyer_category?: string | null
}

export type DisbursementForProfitability = {
  amount: number
  billed: boolean
}

export type InvoiceForProfitability = {
  fees_amount: number
  disbursements_amount: number
  total_amount: number
  paid_amount: number
  status: string
  due_date: string | null
  invoice_date: string
}

export type BudgetForProfitability = {
  target_hours: number | null
  target_billable_hours: number | null
  target_revenue: number | null
} | null | undefined

export type ProfitabilityFlag = {
  type: 'over_budget' | 'excessive_partner_time' | 'significant_write_offs' | 'aged_invoice'
  message: string
}

export type WipAging = { current: number; days30: number; days60: number; days90Plus: number }

export type BudgetComparison = {
  targetHours: number | null
  actualHours: number
  targetBillableHours: number | null
  actualBillableHours: number
  targetCost: number | null
  actualCost: number
  overBudget: boolean
}

export type MatterProfitability = {
  revenue: number
  cost: { timeCost: number; expenses: number; total: number }
  profit: number
  marginPct: number | null
  feesCollected: number
  collectionRate: number | null
  recordedBillableValue: number
  invoicedBillableValue: number
  realisationRate: number | null
  wip: number
  wipAging: WipAging
  writeOffs: number
  missingCostRateEntryCount: number
  budgetComparison: BudgetComparison | null
  flags: ProfitabilityFlag[]
}

export function flagOverBudget(comparison: BudgetComparison | null): ProfitabilityFlag[] {
  if (!comparison || !comparison.overBudget) return []
  return [{ type: 'over_budget', message: 'Actual hours or internal cost exceed the agreed budget for this matter.' }]
}

// Category names are free text set by the firm (e.g. "Partner", "Senior
// Associate") -- a substring match is a pragmatic v1 heuristic rather than
// a fixed enum, since firms name grades differently.
export function flagExcessivePartnerTime(entries: TimeEntryForProfitability[]): ProfitabilityFlag[] {
  const totalHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0)
  if (totalHours === 0) return []
  const partnerHours = entries
    .filter((e) => (e.lawyer_category || '').toLowerCase().includes('partner'))
    .reduce((s, e) => s + Number(e.hours || 0), 0)
  const pct = partnerHours / totalHours
  if (pct > PARTNER_TIME_THRESHOLD_PCT) {
    return [{
      type: 'excessive_partner_time',
      message: `Partner-grade time is ${(pct * 100).toFixed(0)}% of hours on this matter (threshold ${(PARTNER_TIME_THRESHOLD_PCT * 100).toFixed(0)}%).`,
    }]
  }
  return []
}

export function flagSignificantWriteOffs(writeOffs: number, recordedBillableValue: number): ProfitabilityFlag[] {
  if (recordedBillableValue <= 0 || writeOffs <= 0) return []
  const pct = writeOffs / recordedBillableValue
  if (pct > WRITE_OFF_THRESHOLD_PCT) {
    return [{
      type: 'significant_write_offs',
      message: `Write-offs are ${(pct * 100).toFixed(0)}% of recorded billable value (threshold ${(WRITE_OFF_THRESHOLD_PCT * 100).toFixed(0)}%).`,
    }]
  }
  return []
}

export function flagAgedInvoices(invoices: InvoiceForProfitability[], asOf: Date = new Date()): ProfitabilityFlag[] {
  const flags: ProfitabilityFlag[] = []
  for (const inv of invoices) {
    if (inv.status !== 'open' && inv.status !== 'partially_paid') continue
    if (!inv.due_date) continue
    const daysOverdue = Math.floor((asOf.getTime() - new Date(inv.due_date).getTime()) / 86400000)
    if (daysOverdue > AGED_INVOICE_DAYS) {
      const outstanding = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)
      flags.push({
        type: 'aged_invoice',
        message: `Invoice overdue by ${daysOverdue} days, ${outstanding.toFixed(2)} outstanding.`,
      })
    }
  }
  return flags
}

export function computeMatterProfitability(input: {
  timeEntries: TimeEntryForProfitability[]
  disbursements: DisbursementForProfitability[]
  invoices: InvoiceForProfitability[]
  budget?: BudgetForProfitability
  asOfDate?: Date
}): MatterProfitability {
  const asOf = input.asOfDate ?? new Date()

  const revenue = input.invoices.reduce((s, i) => s + Number(i.fees_amount || 0), 0)
  const timeCost = input.timeEntries.reduce((s, e) => s + Number(e.internal_cost_amount || 0), 0)
  const missingCostRateEntryCount = input.timeEntries.filter((e) => e.billable && e.internal_cost_amount == null).length
  const expenses = input.disbursements.reduce((s, d) => s + Number(d.amount || 0), 0)
  const cost = { timeCost, expenses, total: timeCost + expenses }
  const profit = revenue - cost.total
  const marginPct = revenue > 0 ? profit / revenue : null

  const feesCollected = input.invoices.reduce((s, i) => {
    const total = Number(i.total_amount || 0)
    const fees = Number(i.fees_amount || 0)
    const paid = Number(i.paid_amount || 0)
    if (total <= 0) return s
    return s + paid * (fees / total)
  }, 0)
  const collectionRate = revenue > 0 ? feesCollected / revenue : null

  const billableEntries = input.timeEntries.filter((e) => e.billable)
  const recordedBillableValue = billableEntries.reduce((s, e) => s + Number(e.amount || 0), 0)
  const invoicedEntries = billableEntries.filter((e) => e.status === 'billed')
  const invoicedBillableValue = invoicedEntries.reduce(
    (s, e) => s + (Number(e.amount || 0) - Number(e.write_off_amount || 0)), 0
  )
  const realisationRate = recordedBillableValue > 0 ? invoicedBillableValue / recordedBillableValue : null

  const unbilledEntries = billableEntries.filter((e) => e.status !== 'billed')
  const wip = unbilledEntries.reduce((s, e) => s + Number(e.amount || 0), 0)
  const wipAging: WipAging = { current: 0, days30: 0, days60: 0, days90Plus: 0 }
  for (const e of unbilledEntries) {
    const days = Math.floor((asOf.getTime() - new Date(e.entry_date).getTime()) / 86400000)
    const amt = Number(e.amount || 0)
    if (days < 30) wipAging.current += amt
    else if (days < 60) wipAging.days30 += amt
    else if (days < 90) wipAging.days60 += amt
    else wipAging.days90Plus += amt
  }

  const writeOffs = input.timeEntries.reduce((s, e) => s + Number(e.write_off_amount || 0), 0)

  const actualHours = input.timeEntries.reduce((s, e) => s + Number(e.hours || 0), 0)
  const actualBillableHours = billableEntries.reduce((s, e) => s + Number(e.hours || 0), 0)

  let budgetComparison: BudgetComparison | null = null
  if (input.budget) {
    const targetHours = input.budget.target_hours != null ? Number(input.budget.target_hours) : null
    const targetBillableHours = input.budget.target_billable_hours != null ? Number(input.budget.target_billable_hours) : null
    const targetCost = input.budget.target_revenue != null ? Number(input.budget.target_revenue) : null
    const overBudget =
      (targetHours != null && actualHours > targetHours) ||
      (targetBillableHours != null && actualBillableHours > targetBillableHours) ||
      (targetCost != null && cost.total > targetCost)
    budgetComparison = { targetHours, actualHours, targetBillableHours, actualBillableHours, targetCost, actualCost: cost.total, overBudget }
  }

  const flags: ProfitabilityFlag[] = [
    ...flagOverBudget(budgetComparison),
    ...flagExcessivePartnerTime(input.timeEntries),
    ...flagSignificantWriteOffs(writeOffs, recordedBillableValue),
    ...flagAgedInvoices(input.invoices, asOf),
  ]

  return {
    revenue, cost, profit, marginPct, feesCollected, collectionRate,
    recordedBillableValue, invoicedBillableValue, realisationRate,
    wip, wipAging, writeOffs, missingCostRateEntryCount, budgetComparison, flags,
  }
}

export type ClientProfitabilityRollup = {
  revenue: number
  cost: { timeCost: number; expenses: number; total: number }
  profit: number
  marginPct: number | null
  feesCollected: number
  collectionRate: number | null
  wip: number
  writeOffs: number
}

export function rollupClientProfitability(
  matterResults: { matterId: string; profitability: MatterProfitability }[]
): ClientProfitabilityRollup {
  const revenue = matterResults.reduce((s, m) => s + m.profitability.revenue, 0)
  const timeCost = matterResults.reduce((s, m) => s + m.profitability.cost.timeCost, 0)
  const expenses = matterResults.reduce((s, m) => s + m.profitability.cost.expenses, 0)
  const cost = { timeCost, expenses, total: timeCost + expenses }
  const profit = revenue - cost.total
  const marginPct = revenue > 0 ? profit / revenue : null
  const feesCollected = matterResults.reduce((s, m) => s + m.profitability.feesCollected, 0)
  const collectionRate = revenue > 0 ? feesCollected / revenue : null
  const wip = matterResults.reduce((s, m) => s + m.profitability.wip, 0)
  const writeOffs = matterResults.reduce((s, m) => s + m.profitability.writeOffs, 0)
  return { revenue, cost, profit, marginPct, feesCollected, collectionRate, wip, writeOffs }
}

export type TimekeeperProfitability = {
  lawyerId: string
  category: string | null
  hours: number
  billableHours: number
  revenue: number
  internalCost: number
  profitContribution: number
}

// "revenue" here is billable time value recorded against this timekeeper,
// not necessarily yet invoiced -- invoices don't split fees by timekeeper,
// so this is the closest per-timekeeper revenue proxy available.
export function rollupTimekeeperProfitability(entries: TimeEntryForProfitability[]): TimekeeperProfitability[] {
  const byLawyer = new Map<string, TimekeeperProfitability>()
  for (const e of entries) {
    if (!e.lawyer_id) continue
    let row = byLawyer.get(e.lawyer_id)
    if (!row) {
      row = { lawyerId: e.lawyer_id, category: e.lawyer_category ?? null, hours: 0, billableHours: 0, revenue: 0, internalCost: 0, profitContribution: 0 }
      byLawyer.set(e.lawyer_id, row)
    }
    row.hours += Number(e.hours || 0)
    if (e.billable) {
      row.billableHours += Number(e.hours || 0)
      row.revenue += Number(e.amount || 0)
    }
    row.internalCost += Number(e.internal_cost_amount || 0)
  }
  for (const row of byLawyer.values()) {
    row.profitContribution = row.revenue - row.internalCost
  }
  return [...byLawyer.values()].sort((a, b) => b.profitContribution - a.profitContribution)
}

export type GroupProfitabilityRow = {
  group: string
  revenue: number
  cost: number
  profit: number
  marginPct: number | null
  matterCount: number
}

export function rollupByGroup(
  matters: { id: string; responsible_lawyer: string | null; law_type: string | null }[],
  matterResults: Map<string, MatterProfitability>,
  groupBy: 'responsible_lawyer' | 'law_type'
): GroupProfitabilityRow[] {
  const byGroup = new Map<string, GroupProfitabilityRow>()
  for (const m of matters) {
    const result = matterResults.get(m.id)
    if (!result) continue
    const key = (groupBy === 'responsible_lawyer' ? m.responsible_lawyer : m.law_type) || 'Unassigned'
    let row = byGroup.get(key)
    if (!row) {
      row = { group: key, revenue: 0, cost: 0, profit: 0, marginPct: null, matterCount: 0 }
      byGroup.set(key, row)
    }
    row.revenue += result.revenue
    row.cost += result.cost.total
    row.profit += result.profit
    row.matterCount += 1
  }
  for (const row of byGroup.values()) {
    row.marginPct = row.revenue > 0 ? row.profit / row.revenue : null
  }
  return [...byGroup.values()].sort((a, b) => b.profit - a.profit)
}

export type TrendBucket = { period: string; profitability: MatterProfitability }

export function computeTrend(input: {
  timeEntries: TimeEntryForProfitability[]
  disbursements: (DisbursementForProfitability & { disb_date: string })[]
  invoices: (InvoiceForProfitability & { invoice_date: string })[]
  groupBy: 'month' | 'quarter'
}): TrendBucket[] {
  const periodOf = (dateStr: string) => {
    const d = new Date(dateStr)
    const y = d.getFullYear()
    if (input.groupBy === 'quarter') {
      const q = Math.floor(d.getMonth() / 3) + 1
      return `${y}-Q${q}`
    }
    return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const periods = new Set<string>()
  input.timeEntries.forEach((e) => periods.add(periodOf(e.entry_date)))
  input.invoices.forEach((i) => periods.add(periodOf(i.invoice_date)))

  return [...periods].sort().map((period) => {
    const entries = input.timeEntries.filter((e) => periodOf(e.entry_date) === period)
    const disbursements = input.disbursements.filter((d) => periodOf(d.disb_date) === period)
    const invoices = input.invoices.filter((i) => periodOf(i.invoice_date) === period)
    return { period, profitability: computeMatterProfitability({ timeEntries: entries, disbursements, invoices }) }
  })
}
