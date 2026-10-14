import { describe, it, expect } from 'vitest'
import { classifyLaptop, assessRepairCost } from '@/lib/assettrack/policy'

describe('classifyLaptop', () => {
  const today = new Date('2026-10-14')

  it('classifies a laptop with a warranty end date in the future as warranty_active, regardless of age', () => {
    expect(
      classifyLaptop({ purchase_date: '2020-01-01', warranty_end_date: '2026-12-31' }, today)
    ).toBe('warranty_active')
  })

  it('classifies a laptop exactly 3 years old (boundary) as new', () => {
    expect(classifyLaptop({ purchase_date: '2023-10-14', warranty_end_date: null }, today)).toBe('new')
  })

  it('classifies a laptop just over 3 years old as old', () => {
    expect(classifyLaptop({ purchase_date: '2023-10-01', warranty_end_date: null }, today)).toBe('old')
  })

  it('classifies a laptop with an expired warranty by age, not warranty status', () => {
    expect(
      classifyLaptop({ purchase_date: '2025-01-01', warranty_end_date: '2026-01-01' }, today)
    ).toBe('new')
  })

  it('requires review when there is no purchase date to compute age from', () => {
    expect(classifyLaptop({ purchase_date: null, warranty_end_date: null }, today)).toBe('review_required')
  })
})

describe('assessRepairCost', () => {
  it('recommends repair_review at the 40% boundary (inclusive)', () => {
    expect(assessRepairCost(400, 1000)).toEqual({ ratio: 0.4, recommendation: 'repair_review' })
  })

  it('recommends manager_review just above 40%', () => {
    const result = assessRepairCost(401, 1000)
    expect(result.recommendation).toBe('manager_review')
    expect(result.ratio).toBeCloseTo(0.401)
  })

  it('recommends manager_review at the 60% boundary (inclusive)', () => {
    expect(assessRepairCost(600, 1000)).toEqual({ ratio: 0.6, recommendation: 'manager_review' })
  })

  it('recommends replacement_review just above 60%', () => {
    const result = assessRepairCost(601, 1000)
    expect(result.recommendation).toBe('replacement_review')
    expect(result.ratio).toBeCloseTo(0.601)
  })

  it('flags insufficient_data when either cost is missing', () => {
    expect(assessRepairCost(null, 1000)).toEqual({ ratio: null, recommendation: 'insufficient_data' })
    expect(assessRepairCost(400, null)).toEqual({ ratio: null, recommendation: 'insufficient_data' })
  })

  it('flags insufficient_data for a non-positive replacement cost', () => {
    expect(assessRepairCost(400, 0)).toEqual({ ratio: null, recommendation: 'insufficient_data' })
  })

  it('flags insufficient_data for a negative repair cost', () => {
    expect(assessRepairCost(-50, 1000)).toEqual({ ratio: null, recommendation: 'insufficient_data' })
  })
})
