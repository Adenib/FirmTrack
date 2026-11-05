import { describe, it, expect } from 'vitest'
import { matchApprovalRule, buildApprovalSteps, approvalChainStatus, type ApprovalRule } from '@/lib/procuretrack/approval-rules'

describe('matchApprovalRule', () => {
  const blanketLow: ApprovalRule = {
    id: 'blanket-low', minAmount: 0, maxAmount: 500000, departmentId: null,
    approverSequence: [{ role: 'manager' }],
  }
  const blanketHigh: ApprovalRule = {
    id: 'blanket-high', minAmount: 500000, maxAmount: null, departmentId: null,
    approverSequence: [{ role: 'manager' }, { role: 'accounts' }],
  }
  const deptSpecific: ApprovalRule = {
    id: 'dept-specific', minAmount: 0, maxAmount: 1000000, departmentId: 'dept-1',
    approverSequence: [{ role: 'owner' }],
  }

  it('picks the blanket rule whose band contains the amount', () => {
    const rule = matchApprovalRule([blanketLow, blanketHigh], { amount: 300000, departmentId: null })
    expect(rule?.id).toBe('blanket-low')
  })

  it('picks the unbounded (max_amount null) rule for amounts above every bounded band', () => {
    const rule = matchApprovalRule([blanketLow, blanketHigh], { amount: 9000000, departmentId: null })
    expect(rule?.id).toBe('blanket-high')
  })

  it('treats the boundary amount (exactly at max_amount) as inside that band', () => {
    const rule = matchApprovalRule([blanketLow, blanketHigh], { amount: 500000, departmentId: null })
    expect(rule?.id).toBe('blanket-low')
  })

  it('prefers a department-specific rule over a blanket rule at the same amount', () => {
    const rule = matchApprovalRule([blanketLow, deptSpecific], { amount: 300000, departmentId: 'dept-1' })
    expect(rule?.id).toBe('dept-specific')
  })

  it('falls back to the blanket rule for a different department', () => {
    const rule = matchApprovalRule([blanketLow, deptSpecific], { amount: 300000, departmentId: 'dept-2' })
    expect(rule?.id).toBe('blanket-low')
  })

  it('returns null when no rule matches', () => {
    const rule = matchApprovalRule([deptSpecific], { amount: 300000, departmentId: 'dept-2' })
    expect(rule).toBeNull()
  })
})

describe('buildApprovalSteps', () => {
  it('expands approver_sequence into 1-indexed sequence steps', () => {
    const rule: ApprovalRule = {
      id: 'r', minAmount: 0, maxAmount: null, departmentId: null,
      approverSequence: [{ role: 'manager' }, { role: 'accounts' }],
    }
    expect(buildApprovalSteps(rule)).toEqual([
      { sequenceNo: 1, approverRole: 'manager' },
      { sequenceNo: 2, approverRole: 'accounts' },
    ])
  })
})

describe('approvalChainStatus', () => {
  it('is pending while any step is still pending', () => {
    expect(approvalChainStatus([{ status: 'approved' }, { status: 'pending' }])).toBe('pending')
  })

  it('is approved once every step is approved', () => {
    expect(approvalChainStatus([{ status: 'approved' }, { status: 'approved' }])).toBe('approved')
  })

  it('is rejected if any single step was rejected, even if others are still pending', () => {
    expect(approvalChainStatus([{ status: 'approved' }, { status: 'rejected' }, { status: 'pending' }])).toBe('rejected')
  })
})
