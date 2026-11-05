// Pure budget-usage math -- no I/O. Mirrors AccountTrack's own budgets
// table convention: committed/actual are computed live over already-
// fetched rows, never stored as columns on procuretrack_budgets itself.

export function computeBudgetUsage(
  budgetedAmount: number,
  openPoTotals: number[],
  paidInvoiceTotals: number[]
): { budgeted: number; committed: number; actual: number; remaining: number } {
  const committed = openPoTotals.reduce((sum, v) => sum + v, 0)
  const actual = paidInvoiceTotals.reduce((sum, v) => sum + v, 0)
  return {
    budgeted: budgetedAmount,
    committed,
    actual,
    remaining: Math.round((budgetedAmount - committed - actual) * 100) / 100,
  }
}
