import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  getChartOfAccounts, type TestTenant,
} from '../helpers/test-client'

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function iso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

describe('accounting period closing', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('PeriodClosing')
    const client = await createTestClient(tenant, 'Period Closing Test Client')
    const matter = await createTestMatter(tenant, client.id, 'Period Closing Test Matter')
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('closing the current month blocks new postings dated inside it, reopening unblocks them', async () => {
    const now = new Date()
    const start = iso(new Date(now.getFullYear(), now.getMonth(), 1))
    const end = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))

    const closeRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'POST',
      body: JSON.stringify({ period_type: 'month', period_start: start, period_end: end }),
    })
    expect(closeRes.status).toBe(200)
    const { period } = await closeRes.json()
    expect(period.status).toBe('closed')

    const blockedRes = await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, description: 'Should be blocked', amount_usd: 50 }),
    })
    expect(blockedRes.status).toBe(400)
    const blockedBody = await blockedRes.json()
    expect(blockedBody.error).toMatch(/closed/i)

    const reopenRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'PATCH',
      body: JSON.stringify({ id: period.id }),
    })
    expect(reopenRes.status).toBe(200)
    const { period: reopened } = await reopenRes.json()
    expect(reopened.status).toBe('open')

    const unblockedRes = await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, description: 'Should work now', amount_usd: 50 }),
    })
    expect(unblockedRes.status).toBe(200)
  })

  it('closing a year with real revenue posts a closing entry and updates the balance sheet split; reopening reverses it exactly', async () => {
    const accounts = await getChartOfAccounts(tenant)
    const feesId = accounts.find((a) => a.key === 'fees_earned')!.id
    const arId = accounts.find((a) => a.key === 'accounts_receivable')!.id

    const manualRes = await tenant.fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2024-06-15',
        description: '2024 revenue for year-close test',
        lines: [
          { account_id: arId, matter_id: matterId, debit_usd: 900 },
          { account_id: feesId, matter_id: matterId, credit_usd: 900 },
        ],
      }),
    })
    expect(manualRes.status).toBe(200)

    const bsBefore = await (await tenant.fetch('/api/accounttrack/statements/balance-sheet?as_of=2024-12-31')).json()
    expect(bsBefore.equity.current_year_earnings).toBe(900)
    expect(bsBefore.equity.retained_earnings).toBe(0)

    const closeRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'POST',
      body: JSON.stringify({ period_type: 'year', period_start: '2024-01-01', period_end: '2024-12-31' }),
    })
    expect(closeRes.status).toBe(200)
    const { period } = await closeRes.json()
    expect(period.closing_entry_id).toBeTruthy()

    const bsAfter = await (await tenant.fetch('/api/accounttrack/statements/balance-sheet?as_of=2024-12-31')).json()
    expect(bsAfter.equity.retained_earnings).toBe(900)
    expect(bsAfter.equity.current_year_earnings).toBe(0)
    expect(bsAfter.balances).toBe(true)

    const reopenRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'PATCH',
      body: JSON.stringify({ id: period.id }),
    })
    expect(reopenRes.status).toBe(200)

    const bsReopened = await (await tenant.fetch('/api/accounttrack/statements/balance-sheet?as_of=2024-12-31')).json()
    expect(bsReopened.equity.retained_earnings).toBe(0)
    expect(bsReopened.equity.current_year_earnings).toBe(900)
    expect(bsReopened.balances).toBe(true)
  })

  it('closing a year with no revenue/expense activity posts no closing entry', async () => {
    const closeRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'POST',
      body: JSON.stringify({ period_type: 'year', period_start: '2019-01-01', period_end: '2019-12-31' }),
    })
    expect(closeRes.status).toBe(200)
    const { period } = await closeRes.json()
    expect(period.closing_entry_id).toBeNull()
  })
})
