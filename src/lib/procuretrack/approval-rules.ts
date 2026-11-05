// Pure helpers over procuretrack_approval_rules / procuretrack_approvals --
// no I/O, directly unit-testable. Approval rules are data (edited in
// Settings), never hard-coded thresholds in route code.

export type ApprovalRule = {
  id: string
  minAmount: number
  maxAmount: number | null
  departmentId: string | null
  approverSequence: { role: string }[]
}

// Picks the single most-specific matching rule for a requisition's amount
// and department: a department-specific rule beats a blanket one (null
// departmentId), and among rules of the same specificity the narrowest
// amount band wins (max_amount null treated as unbounded/largest). Returns
// null when nothing matches -- the caller decides what that means (e.g.
// "no approval required" or "misconfigured, block submission").
export function matchApprovalRule(
  rules: ApprovalRule[],
  input: { amount: number; departmentId: string | null }
): ApprovalRule | null {
  const candidates = rules.filter((r) => {
    const amountOk = input.amount >= r.minAmount && (r.maxAmount == null || input.amount <= r.maxAmount)
    const deptOk = r.departmentId == null || r.departmentId === input.departmentId
    return amountOk && deptOk
  })
  if (candidates.length === 0) return null

  const bandWidth = (r: ApprovalRule) => (r.maxAmount == null ? Infinity : r.maxAmount - r.minAmount)
  return candidates.sort((a, b) => {
    const aSpecific = a.departmentId != null
    const bSpecific = b.departmentId != null
    if (aSpecific !== bSpecific) return aSpecific ? -1 : 1
    return bandWidth(a) - bandWidth(b)
  })[0]
}

export type ApprovalStep = { sequenceNo: number; approverRole: string }

// Expands a matched rule's approver_sequence into ordered approval rows
// for a submitted requisition. Who may actually decide each step --
// anyone holding approverRole EXCEPT the requisition's own requester -- is
// enforced where the decision is recorded (procuretrack_approvals has no
// specific-approver column, only a role per step), not here.
export function buildApprovalSteps(rule: ApprovalRule): ApprovalStep[] {
  return rule.approverSequence.map((step, i) => ({ sequenceNo: i + 1, approverRole: step.role }))
}

// True once every step on the requisition has a non-pending status, and
// all of them are 'approved' -- any single rejection fails the whole chain
// immediately (the caller should stop asking for further decisions once a
// rejection is seen, but this is the pure summary either way).
export function approvalChainStatus(
  steps: { status: 'pending' | 'approved' | 'rejected' }[]
): 'pending' | 'approved' | 'rejected' {
  if (steps.some((s) => s.status === 'rejected')) return 'rejected'
  if (steps.every((s) => s.status === 'approved')) return 'approved'
  return 'pending'
}
