import { describe, it, expect } from 'vitest'
import { countLeaveDays, computeLeaveBalance } from '@/lib/hrtrack/leave-balance'

describe('countLeaveDays', () => {
  it('counts inclusively (same start and end = 1 day)', () => {
    expect(countLeaveDays('2026-07-20', '2026-07-20')).toBe(1)
  })

  it('counts a 5-day range inclusively', () => {
    expect(countLeaveDays('2026-07-20', '2026-07-24')).toBe(5)
  })

  it('counts across a month boundary', () => {
    expect(countLeaveDays('2026-07-30', '2026-08-02')).toBe(4)
  })
})

describe('computeLeaveBalance', () => {
  it('returns the full allocation when nothing has been used', () => {
    expect(computeLeaveBalance(20, [])).toBe(20)
  })

  it('subtracts already-used days from the allocation', () => {
    expect(computeLeaveBalance(20, [{ days: 5 }, { days: 3 }])).toBe(12)
  })

  it('can go negative if somehow over-used (informational, not clamped)', () => {
    expect(computeLeaveBalance(5, [{ days: 8 }])).toBe(-3)
  })
})
