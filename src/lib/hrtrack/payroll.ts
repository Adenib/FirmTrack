import { createClient } from '@supabase/supabase-js'
import { assertPeriodOpen, postJournalEntry, JournalPostingError, type JournalLineInput } from '@/lib/accounttrack/post-journal-entry'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class PayrollError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export type Deduction = { name: string; amount: number }

export type PayrollLineItem = {
  base_salary: number
  leave_allowance: number
  deductions: Deduction[]
}

export function deductionsTotalUsd(deductions: Deduction[] | null | undefined): number {
  return (deductions || []).reduce((sum, d) => sum + Number(d.amount || 0), 0)
}

export function netPayUsd(lineItem: PayrollLineItem): number {
  return Number(lineItem.base_salary) + Number(lineItem.leave_allowance) - deductionsTotalUsd(lineItem.deductions)
}

type LeaveDetails = { start_date?: string }

// Approved leave with an allowance set, not yet paid by any run, whose
// start_date falls in [periodStart, periodEnd] -- re-run at both draft
// creation and posting time (see postPayrollRun) rather than trusting a
// stored snapshot, so a leave request approved between the two can still
// be picked up correctly.
async function findUnpaidLeaveAllowances(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
  userId?: string
) {
  let query = supabaseAdmin
    .from('requests')
    .select('id, user_id, leave_allowance_amount, details')
    .eq('tenant_id', tenantId)
    .eq('type', 'leave')
    .eq('status', 'approved')
    .is('paid_in_payroll_run_id', null)
    .not('leave_allowance_amount', 'is', null)

  if (userId) query = query.eq('user_id', userId)

  const { data } = await query
  return (data || []).filter((r) => {
    const startDate = (r.details as LeaveDetails)?.start_date
    return !!startDate && startDate >= periodStart && startDate <= periodEnd
  })
}

export type CreatePayrollRunInput = {
  tenantId: string
  periodStart: string
  periodEnd: string
  payDate: string
  createdBy: string
}

// Snapshots each employee's currently-effective salary plus any unpaid
// leave allowance due in the period into a draft run. Does not post to
// the ledger or mark leave requests as paid -- that only happens on
// postPayrollRun, so deleting a draft has no side effects to unwind.
export async function createPayrollRun(input: CreatePayrollRunInput) {
  const { data: salaryRows } = await supabaseAdmin
    .from('payroll_salaries')
    .select('user_id, amount, effective_from')
    .eq('tenant_id', input.tenantId)
    .lte('effective_from', input.periodEnd)
    .order('effective_from', { ascending: false })

  const currentSalaryByUser = new Map<string, number>()
  for (const row of salaryRows || []) {
    if (!currentSalaryByUser.has(row.user_id)) currentSalaryByUser.set(row.user_id, Number(row.amount))
  }
  if (currentSalaryByUser.size === 0) {
    throw new PayrollError('No employees have a salary on record as of this period', 400)
  }

  const unpaidLeave = await findUnpaidLeaveAllowances(input.tenantId, input.periodStart, input.periodEnd)
  const allowanceByUser = new Map<string, number>()
  for (const r of unpaidLeave) {
    allowanceByUser.set(r.user_id, (allowanceByUser.get(r.user_id) || 0) + Number(r.leave_allowance_amount))
  }

  const { data: run, error: runError } = await supabaseAdmin
    .from('payroll_runs')
    .insert({
      tenant_id: input.tenantId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      pay_date: input.payDate,
      status: 'draft',
      created_by: input.createdBy,
    })
    .select()
    .single()
  if (runError || !run) throw new PayrollError(runError?.message || 'Failed to create payroll run', 500)

  const lineItemRows = Array.from(currentSalaryByUser.entries()).map(([userId, salary]) => ({
    tenant_id: input.tenantId,
    payroll_run_id: run.id,
    user_id: userId,
    base_salary: salary,
    leave_allowance: allowanceByUser.get(userId) || 0,
    deductions: [] as Deduction[],
  }))

  const { data: lineItems, error: liError } = await supabaseAdmin
    .from('payroll_line_items')
    .insert(lineItemRows)
    .select()
  if (liError) throw new PayrollError(liError.message, 500)

  return { run, lineItems: lineItems || [] }
}

export type PostPayrollRunInput = {
  tenantId: string
  runId: string
  postedBy: string
}

// Posts one journal entry per line item (Dr salaries_expense, Cr
// payroll_liabilities for deductions, Cr operating_cash for net pay),
// re-resolving each employee's unpaid leave allowance fresh at post time
// rather than trusting the draft-time snapshot, then marks the run
// posted and the consumed leave requests paid.
export async function postPayrollRun(input: PostPayrollRunInput) {
  const { data: run } = await supabaseAdmin
    .from('payroll_runs')
    .select('*')
    .eq('id', input.runId)
    .eq('tenant_id', input.tenantId)
    .single()
  if (!run) throw new PayrollError('Payroll run not found', 404)
  if (run.status !== 'draft') throw new PayrollError('Only a draft payroll run can be posted', 400)

  try {
    await assertPeriodOpen(input.tenantId, run.pay_date)
  } catch (err) {
    if (err instanceof JournalPostingError) throw new PayrollError(err.message, 400)
    throw err
  }

  const { data: lineItems } = await supabaseAdmin
    .from('payroll_line_items')
    .select('*')
    .eq('payroll_run_id', run.id)
  if (!lineItems || lineItems.length === 0) throw new PayrollError('Payroll run has no line items', 400)

  const { data: lawyerRows } = await supabaseAdmin
    .from('lawyers')
    .select('id, user_id')
    .eq('tenant_id', input.tenantId)
  const lawyerIdByUser = new Map((lawyerRows || []).map((l) => [l.user_id, l.id]))

  for (const item of lineItems) {
    const unpaidLeave = await findUnpaidLeaveAllowances(input.tenantId, run.period_start, run.period_end, item.user_id)
    const leaveAllowanceUsd = unpaidLeave.reduce((sum, r) => sum + Number(r.leave_allowance_amount), 0)

    const deductionsTotal = deductionsTotalUsd(item.deductions as Deduction[])
    const grossUsd = Number(item.base_salary) + leaveAllowanceUsd
    const netUsd = grossUsd - deductionsTotal
    if (netUsd < 0) {
      throw new PayrollError(`Deductions (${deductionsTotal}) exceed gross pay (${grossUsd}) for one line item`, 400)
    }

    const lawyerId = lawyerIdByUser.get(item.user_id) || null
    const lines: JournalLineInput[] = [{ accountKey: 'salaries_expense', lawyerId, debit: grossUsd }]
    if (deductionsTotal > 0) lines.push({ accountKey: 'payroll_liabilities', lawyerId, credit: deductionsTotal })
    lines.push({ accountKey: 'operating_cash', lawyerId, credit: netUsd })

    await postJournalEntry({
      tenantId: input.tenantId,
      entryDate: run.pay_date,
      description: `Payroll ${run.period_start} to ${run.period_end}`,
      sourceType: 'payroll_run',
      sourceId: item.id,
      createdBy: input.postedBy,
      lines,
    })

    if (leaveAllowanceUsd !== Number(item.leave_allowance)) {
      await supabaseAdmin.from('payroll_line_items').update({ leave_allowance: leaveAllowanceUsd }).eq('id', item.id)
    }
    if (unpaidLeave.length > 0) {
      await supabaseAdmin.from('requests').update({ paid_in_payroll_run_id: run.id }).in('id', unpaidLeave.map((r) => r.id))
    }
  }

  const { data: updatedRun, error } = await supabaseAdmin
    .from('payroll_runs')
    .update({ status: 'posted', posted_by: input.postedBy, posted_at: new Date().toISOString() })
    .eq('id', run.id)
    .select()
    .single()
  if (error) throw new PayrollError(error.message, 500)
  return updatedRun
}
