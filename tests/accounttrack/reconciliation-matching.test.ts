import { describe, it, expect } from 'vitest'
import { suggestMatches, reconciliationDifference, type JournalLineCandidate } from '@/lib/accounttrack/reconciliation-matching'

describe('suggestMatches', () => {
  const candidates: JournalLineCandidate[] = [
    { journalLineId: 'a', entryDate: '2026-10-02', description: 'Wire from client', debit: 15000, credit: 0 },
    { journalLineId: 'b', entryDate: '2026-10-03', description: 'Office rent', debit: 0, credit: 4000 },
    { journalLineId: 'c', entryDate: '2026-11-20', description: 'Unrelated, far away in time', debit: 15000, credit: 0 },
    { journalLineId: 'd', entryDate: '2026-10-02', description: 'Wrong amount', debit: 999, credit: 0 },
  ]

  it('matches a deposit (positive amount) to a debit line of the same amount', () => {
    const result = suggestMatches({ lineDate: '2026-10-01', amount: 15000 }, candidates)
    expect(result.map((r) => r.journalLineId)).toEqual(['a'])
  })

  it('matches a withdrawal (negative amount) to a credit line of the same amount', () => {
    const result = suggestMatches({ lineDate: '2026-10-03', amount: -4000 }, candidates)
    expect(result.map((r) => r.journalLineId)).toEqual(['b'])
  })

  it('excludes candidates outside the date-proximity window even with the right amount', () => {
    const result = suggestMatches({ lineDate: '2026-10-01', amount: 15000 }, candidates)
    expect(result.map((r) => r.journalLineId)).not.toContain('c')
  })

  it('excludes candidates with a different amount even on the same date', () => {
    const result = suggestMatches({ lineDate: '2026-10-02', amount: 15000 }, candidates)
    expect(result.map((r) => r.journalLineId)).not.toContain('d')
  })

  it('ranks closer dates first when multiple candidates match', () => {
    const near: JournalLineCandidate = { journalLineId: 'near', entryDate: '2026-10-01', description: '', debit: 500, credit: 0 }
    const far: JournalLineCandidate = { journalLineId: 'far', entryDate: '2026-10-05', description: '', debit: 500, credit: 0 }
    const result = suggestMatches({ lineDate: '2026-10-01', amount: 500 }, [far, near])
    expect(result.map((r) => r.journalLineId)).toEqual(['near', 'far'])
  })

  it('returns no suggestions when nothing matches', () => {
    const result = suggestMatches({ lineDate: '2026-10-01', amount: 42 }, candidates)
    expect(result).toEqual([])
  })
})

describe('reconciliationDifference', () => {
  it('is zero when the statement closing balance equals the ledger balance', () => {
    expect(reconciliationDifference(10000, 10000)).toBe(0)
  })

  it('is positive when the statement shows more than the ledger', () => {
    expect(reconciliationDifference(10500, 10000)).toBe(500)
  })

  it('rounds to the cent', () => {
    expect(reconciliationDifference(10000.001, 10000)).toBe(0)
  })
})
