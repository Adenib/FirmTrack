import { describe, it, expect } from 'vitest'
import { computeBudgetUsage } from '@/lib/procuretrack/budgets'

describe('computeBudgetUsage', () => {
  it('sums open PO totals as committed and paid invoice totals as actual', () => {
    const result = computeBudgetUsage(1000000, [200000, 50000], [100000])
    expect(result).toEqual({ budgeted: 1000000, committed: 250000, actual: 100000, remaining: 650000 })
  })

  it('reports full remaining budget when nothing has been committed or spent', () => {
    expect(computeBudgetUsage(500000, [], [])).toEqual({ budgeted: 500000, committed: 0, actual: 0, remaining: 500000 })
  })

  it('allows remaining to go negative when overcommitted', () => {
    const result = computeBudgetUsage(100000, [80000], [50000])
    expect(result.remaining).toBe(-30000)
  })

  it('rounds remaining to the cent', () => {
    const result = computeBudgetUsage(100.001, [10], [10])
    expect(result.remaining).toBe(80)
  })
})
