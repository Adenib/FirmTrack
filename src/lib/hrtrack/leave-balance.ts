// Pure functions for leave day-allocation math — no DB/date-now
// dependency, so balance computation and day-counting are unit-testable
// against fixed fixtures.

// Inclusive day count between two ISO date strings (e.g. Mon-Fri = 5 days).
export function countLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
}

// Remaining balance = annual allocation minus days already used by
// APPROVED requests of that leave type in the same year. Not stored —
// computed fresh from whatever approved-request rows the caller passes
// in, matching the "derived, not duplicated" convention used for
// trust-ledger balances and attendance hours elsewhere in this app.
export function computeLeaveBalance(
  annualDays: number,
  approvedRequestsForTypeThisYear: { days: number }[]
): number {
  const used = approvedRequestsForTypeThisYear.reduce((sum, r) => sum + r.days, 0)
  return annualDays - used
}
