import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant,
} from '../helpers/test-client'
import { netPayUsd, deductionsTotalUsd } from '@/lib/hrtrack/payroll'
import { sendPayslipEmail } from '@/lib/hrtrack/send-payslip-email'

type LineWithKey = { debit_usd: number; credit_usd: number; account_key: string | null }

async function getLinesForPayrollLineItem(tenantId: string, lineItemId: string): Promise<LineWithKey[]> {
  const { data: entry } = await supabaseAdmin
    .from('journal_entries')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'payroll_run')
    .eq('source_id', lineItemId)
    .single()
  if (!entry) return []

  const { data: lines } = await supabaseAdmin
    .from('journal_lines')
    .select('debit_usd, credit_usd, chart_of_accounts(key)')
    .eq('journal_entry_id', entry.id)

  return (lines || []).map((l) => ({
    debit_usd: Number(l.debit_usd),
    credit_usd: Number(l.credit_usd),
    account_key: (Array.isArray(l.chart_of_accounts) ? l.chart_of_accounts[0] : l.chart_of_accounts)?.key ?? null,
  }))
}

function findLine(lines: LineWithKey[], key: string) {
  const line = lines.find((l) => l.account_key === key)
  if (!line) throw new Error(`No line found for account key "${key}" among: ${JSON.stringify(lines)}`)
  return line
}

describe('netPayUsd / deductionsTotalUsd', () => {
  it('net pay is base + leave allowance minus deductions', () => {
    const lineItem = { base_salary_usd: 1000, leave_allowance_usd: 100, deductions: [{ name: 'Pension', amount_usd: 80 }, { name: 'Tax', amount_usd: 20 }] }
    expect(deductionsTotalUsd(lineItem.deductions)).toBe(100)
    expect(netPayUsd(lineItem)).toBe(1000)
  })

  it('handles no leave allowance and no deductions', () => {
    expect(netPayUsd({ base_salary_usd: 500, leave_allowance_usd: 0, deductions: [] })).toBe(500)
  })
})

describe('HRTrack Payroll', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let otherStaff: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('Payroll')
    staff = await createTestUser(tenant, { role: 'staff' })
    otherStaff = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId, otherStaff.userId])
  })

  it('a non-owner/admin cannot access salaries or runs', async () => {
    const salariesRes = await staff.fetch('/api/hrtrack/payroll/salaries', {
      method: 'POST',
      body: JSON.stringify({ user_id: staff.userId, amount_usd: 1000, effective_from: '2026-01-01' }),
    })
    expect(salariesRes.status).toBe(403)

    const runsRes = await staff.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-01-01', period_end: '2026-01-31', pay_date: '2026-02-01' }),
    })
    expect(runsRes.status).toBe(403)
  })

  it('setting a salary twice creates two effective-dated rows, not an update', async () => {
    const first = await tenant.fetch('/api/hrtrack/payroll/salaries', {
      method: 'POST',
      body: JSON.stringify({ user_id: staff.userId, amount_usd: 1000, effective_from: '2026-01-01' }),
    })
    expect(first.status).toBe(200)

    const second = await tenant.fetch('/api/hrtrack/payroll/salaries', {
      method: 'POST',
      body: JSON.stringify({ user_id: staff.userId, amount_usd: 1500, effective_from: '2026-03-01' }),
    })
    expect(second.status).toBe(200)

    const listRes = await tenant.fetch(`/api/hrtrack/payroll/salaries?user_id=${staff.userId}`)
    const { salaries } = await listRes.json()
    expect(salaries).toHaveLength(2)
    expect(salaries.map((s: { amount_usd: string }) => Number(s.amount_usd)).sort()).toEqual([1000, 1500])
  })

  it('a staff member can see their own salary but not another staff member\'s', async () => {
    const ownRes = await staff.fetch(`/api/hrtrack/payroll/salaries?user_id=${staff.userId}`)
    expect(ownRes.status).toBe(200)

    const otherRes = await staff.fetch(`/api/hrtrack/payroll/salaries?user_id=${otherStaff.userId}`)
    expect(otherRes.status).toBe(403)
  })

  it('creating a run snapshots the latest effective salary as of period_end for every employee with one', async () => {
    // period_end is 2026-03-15, so the 2026-03-01/$1500 row should win over the 2026-01-01/$1000 row.
    const res = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-03-01', period_end: '2026-03-15', pay_date: '2026-03-20' }),
    })
    expect(res.status).toBe(200)
    const { run, lineItems } = await res.json()
    expect(run.status).toBe('draft')

    const staffLine = lineItems.find((li: { user_id: string }) => li.user_id === staff.userId)
    expect(Number(staffLine.base_salary_usd)).toBe(1500)
    expect(Number(staffLine.leave_allowance_usd)).toBe(0)

    // Delete this throwaway draft -- the balance/leave-allowance tests below create their own runs.
    const delRes = await tenant.fetch('/api/hrtrack/payroll/runs', { method: 'DELETE', body: JSON.stringify({ id: run.id }) })
    expect(delRes.status).toBe(200)
  })

  it('a draft run\'s deductions can be edited before posting, and a posted run cannot be edited or deleted', async () => {
    const createRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-04-01', period_end: '2026-04-30', pay_date: '2026-05-01' }),
    })
    const { run, lineItems } = await createRes.json()
    const staffLine = lineItems.find((li: { user_id: string }) => li.user_id === staff.userId)

    const deductRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'PATCH',
      body: JSON.stringify({
        id: run.id,
        action: 'update_deductions',
        lineItemId: staffLine.id,
        deductions: [{ name: 'Pension', amount_usd: 120 }],
      }),
    })
    expect(deductRes.status).toBe(200)
    const { lineItem: updatedLine } = await deductRes.json()
    expect(netPayUsd(updatedLine)).toBe(1500 - 120)

    const postRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'PATCH',
      body: JSON.stringify({ id: run.id, action: 'post' }),
    })
    expect(postRes.status).toBe(200)
    const { run: postedRun } = await postRes.json()
    expect(postedRun.status).toBe('posted')

    // Ledger: Dr salaries_expense 1500, Cr payroll_liabilities 120, Cr operating_cash 1380.
    const lines = await getLinesForPayrollLineItem(tenant.tenantId, staffLine.id)
    expect(findLine(lines, 'salaries_expense').debit_usd).toBe(1500)
    expect(findLine(lines, 'payroll_liabilities').credit_usd).toBe(120)
    expect(findLine(lines, 'operating_cash').credit_usd).toBe(1380)

    const editAfterPostRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'PATCH',
      body: JSON.stringify({ id: run.id, action: 'update_deductions', lineItemId: staffLine.id, deductions: [] }),
    })
    expect(editAfterPostRes.status).toBe(400)

    const deleteAfterPostRes = await tenant.fetch('/api/hrtrack/payroll/runs', { method: 'DELETE', body: JSON.stringify({ id: run.id }) })
    expect(deleteAfterPostRes.status).toBe(400)
  })

  it('an approved leave request\'s allowance is pulled into a run and paid, then cannot be pulled into a second run', async () => {
    const leaveTypesRes = await tenant.fetch('/api/hrtrack/leave-types')
    const { leaveTypes } = await leaveTypesRes.json()
    const annual = leaveTypes.find((lt: { name: string }) => lt.name === 'Annual')

    const leaveRes = await staff.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'leave', details: { leave_type_id: annual.id, start_date: '2026-06-10', end_date: '2026-06-11' } }),
    })
    const { request } = await leaveRes.json()

    const approveRes = await tenant.fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      body: JSON.stringify({ id: request.id, status: 'approved', leave_allowance_amount: 200 }),
    })
    expect(approveRes.status).toBe(200)

    const runRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-06-01', period_end: '2026-06-30', pay_date: '2026-07-01' }),
    })
    const { run, lineItems } = await runRes.json()
    const staffLine = lineItems.find((li: { user_id: string }) => li.user_id === staff.userId)
    expect(Number(staffLine.leave_allowance_usd)).toBe(200)

    const postRes = await tenant.fetch('/api/hrtrack/payroll/runs', { method: 'PATCH', body: JSON.stringify({ id: run.id, action: 'post' }) })
    expect(postRes.status).toBe(200)

    const { data: paidRequest } = await supabaseAdmin.from('requests').select('paid_in_payroll_run_id').eq('id', request.id).single()
    expect(paidRequest?.paid_in_payroll_run_id).toBe(run.id)

    // A second run for a later period should NOT pull this same allowance in again.
    const secondRunRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-07-01', period_end: '2026-07-31', pay_date: '2026-08-01' }),
    })
    const { lineItems: secondLineItems } = await secondRunRes.json()
    const staffLineAgain = secondLineItems.find((li: { user_id: string }) => li.user_id === staff.userId)
    expect(Number(staffLineAgain.leave_allowance_usd)).toBe(0)
  })

  it('posting into a closed accounting period is rejected', async () => {
    const closeRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'POST',
      body: JSON.stringify({ period_type: 'month', period_start: '2026-09-01', period_end: '2026-09-30' }),
    })
    expect(closeRes.status).toBe(200)

    const runRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-09-01', period_end: '2026-09-30', pay_date: '2026-09-30' }),
    })
    const { run } = await runRes.json()

    const postRes = await tenant.fetch('/api/hrtrack/payroll/runs', { method: 'PATCH', body: JSON.stringify({ id: run.id, action: 'post' }) })
    expect(postRes.status).toBe(400)
    const body = await postRes.json()
    expect(body.error).toMatch(/closed/i)
  })

  it('a staff member can view their own posted payslip PDF but not someone else\'s, and not a draft', async () => {
    const runRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-10-01', period_end: '2026-10-31', pay_date: '2026-10-31' }),
    })
    const { run, lineItems } = await runRes.json()
    const staffLine = lineItems.find((li: { user_id: string }) => li.user_id === staff.userId)

    const draftViewRes = await staff.fetch(`/api/hrtrack/payroll/payslip?line_item_id=${staffLine.id}`)
    expect(draftViewRes.status).toBe(400)

    await tenant.fetch('/api/hrtrack/payroll/runs', { method: 'PATCH', body: JSON.stringify({ id: run.id, action: 'post' }) })

    const otherViewRes = await otherStaff.fetch(`/api/hrtrack/payroll/payslip?line_item_id=${staffLine.id}`)
    expect(otherViewRes.status).toBe(403)

    const ownViewRes = await staff.fetch(`/api/hrtrack/payroll/payslip?line_item_id=${staffLine.id}`)
    expect(ownViewRes.status).toBe(200)
    expect(ownViewRes.headers.get('content-type')).toBe('application/pdf')
    const buf = Buffer.from(await ownViewRes.arrayBuffer())
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')

    const myPayslipsRes = await staff.fetch('/api/hrtrack/payroll/my-payslips')
    const { lineItems: myLineItems } = await myPayslipsRes.json()
    expect(myLineItems.some((li: { id: string }) => li.id === staffLine.id)).toBe(true)
  })

  it('sendPayslipEmail sends to the employee and marks sent_at, via a stubbed transport', async () => {
    const runRes = await tenant.fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ period_start: '2026-11-01', period_end: '2026-11-30', pay_date: '2026-11-30' }),
    })
    const { run, lineItems } = await runRes.json()
    const staffLine = lineItems.find((li: { user_id: string }) => li.user_id === staff.userId)
    await tenant.fetch('/api/hrtrack/payroll/runs', { method: 'PATCH', body: JSON.stringify({ id: run.id, action: 'post' }) })

    const calls: Array<{ to: string; subject: string }> = []
    await sendPayslipEmail(tenant.tenantId, staffLine.id, async (args) => {
      calls.push({ to: args.to, subject: args.subject })
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].to).toBe(staff.email)

    const { data: updated } = await supabaseAdmin.from('payroll_line_items').select('sent_at').eq('id', staffLine.id).single()
    expect(updated?.sent_at).toBeTruthy()
  })
})
