// Pure matching logic for Bank Reconciliation -- no I/O, so it's directly
// unit-testable. Suggests which already-posted journal_lines rows a given
// bank statement line probably corresponds to: exact amount match (same
// sign convention as the statement -- debit minus credit on the account),
// within a date-proximity window, ranked closest-date-first.

export type JournalLineCandidate = {
  journalLineId: string
  entryDate: string // ISO date
  description: string | null
  debit: number
  credit: number
}

export type StatementLine = {
  lineDate: string // ISO date
  amount: number
}

const DATE_WINDOW_DAYS = 5

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / msPerDay)
}

// Ranked closest-date-first; only candidates within the date window and
// with an exact amount match (to the cent) are returned at all -- this is
// a suggestion list for a human to confirm, never an auto-apply.
export function suggestMatches(
  statementLine: StatementLine,
  candidates: JournalLineCandidate[]
): JournalLineCandidate[] {
  return candidates
    .filter((c) => {
      const net = Math.round((c.debit - c.credit) * 100) / 100
      const amount = Math.round(statementLine.amount * 100) / 100
      return net === amount && daysBetween(c.entryDate, statementLine.lineDate) <= DATE_WINDOW_DAYS
    })
    .sort((a, b) => daysBetween(a.entryDate, statementLine.lineDate) - daysBetween(b.entryDate, statementLine.lineDate))
}

// The reconciliation summary figure: statement closing balance minus the
// account's ledger balance as of the same date should be zero once
// everything that belongs on the statement has been matched. unmatchedTotal
// is the net of statement lines still unmatched/not ignored -- the amount
// still unaccounted for.
export function reconciliationDifference(
  statementClosingBalance: number,
  ledgerBalanceAsOfStatementEnd: number
): number {
  return Math.round((statementClosingBalance - ledgerBalanceAsOfStatementEnd) * 100) / 100
}
