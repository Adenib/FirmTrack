import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter, createTestLawyer, type TestTenant,
} from '../helpers/test-client'

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function iso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

describe('lawyer overview aggregation and utilization basis', () => {
  let tenant: TestTenant
  let lawyerId: string
  let monthStart: string
  let monthEnd: string

  beforeAll(async () => {
    tenant = await createTestTenant('LawyerOverview')
    const client = await createTestClient(tenant, 'Lawyer Overview Test Client')
    const matter = await createTestMatter(tenant, client.id, 'Lawyer Overview Test Matter')
    const lawyer = await createTestLawyer(tenant, { nickname: 'LOTEST', initials: 'LOT' })
    lawyerId = lawyer.id

    const now = new Date()
    monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1))
    monthEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))

    await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { matter_id: matter.id, lawyer_id: lawyerId, hours: 6, rate_usd: 100, amount_usd: 600, billable: true },
          { matter_id: matter.id, lawyer_id: lawyerId, hours: 2, rate_usd: 100, amount_usd: 200, billable: false },
        ],
      }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('falls back to a logged-hours ratio when no budget exists', async () => {
    const res = await tenant.fetch(`/api/accounttrack/lawyer-overview?from=${monthStart}&to=${monthEnd}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    const row = body.lawyers.find((r: { lawyer: { id: string } }) => r.lawyer.id === lawyerId)

    expect(row.hours.billable).toBe(6)
    expect(row.hours.non_billable).toBe(2)
    expect(row.revenue).toBe(600)
    expect(row.utilization_basis).toBe('logged_ratio')
    expect(row.utilization).toBeCloseTo(6 / 8, 5)
  })

  it('switches to budget-relative utilization once a budget with target_billable_hours exists', async () => {
    const budgetRes = await tenant.fetch('/api/accounttrack/budgets', {
      method: 'POST',
      body: JSON.stringify({
        lawyer_id: lawyerId,
        period_start: monthStart,
        period_end: monthEnd,
        target_billable_hours: 12,
      }),
    })
    expect(budgetRes.status).toBe(200)

    const res = await tenant.fetch(`/api/accounttrack/lawyer-overview?from=${monthStart}&to=${monthEnd}`)
    const body = await res.json()
    const row = body.lawyers.find((r: { lawyer: { id: string } }) => r.lawyer.id === lawyerId)

    expect(row.utilization_basis).toBe('budget')
    expect(row.utilization).toBeCloseTo(6 / 12, 5)
  })
})
