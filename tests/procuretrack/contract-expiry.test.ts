import { describe, it, expect } from 'vitest'
import { contractsNeedingAlert, type ContractForAlert } from '@/lib/procuretrack/contract-expiry'

describe('contractsNeedingAlert', () => {
  const today = new Date('2026-11-05T12:00:00Z')

  const contracts: ContractForAlert[] = [
    { id: 'a', title: 'Exactly 30 days out', endDate: '2026-12-05' },
    { id: 'b', title: 'Exactly 7 days out', endDate: '2026-11-12' },
    { id: 'c', title: 'Exactly 1 day out', endDate: '2026-11-06' },
    { id: 'd', title: '29 days out -- not a threshold', endDate: '2026-12-04' },
    { id: 'e', title: 'Already expired', endDate: '2026-10-01' },
  ]

  it('picks contracts at exactly 30, 7, or 1 days before end_date', () => {
    const result = contractsNeedingAlert(contracts, today)
    expect(result.map((c) => c.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('does not re-alert a contract on a day between thresholds', () => {
    const result = contractsNeedingAlert(contracts, today)
    expect(result.map((c) => c.id)).not.toContain('d')
  })

  it('does not alert on an already-expired contract', () => {
    const result = contractsNeedingAlert(contracts, today)
    expect(result.map((c) => c.id)).not.toContain('e')
  })

  it('respects a custom alertDays list', () => {
    const result = contractsNeedingAlert(contracts, today, [29])
    expect(result.map((c) => c.id)).toEqual(['d'])
  })
})
