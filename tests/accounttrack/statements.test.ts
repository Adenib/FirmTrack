import { afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestClient, createTestMatter, type TestTenant } from '../helpers/test-client'

describe('balance sheet self-check', () => {
  let tenant: TestTenant

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant)
  })

  it('balances after a mixed sequence of disbursement, trust, and invoice+payment transactions', async () => {
    tenant = await createTestTenant('Statements')
    const client = await createTestClient(tenant, 'Statements Test Client')
    const matter = await createTestMatter(tenant, client.id, 'Statements Test Matter')

    await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, description: 'Courier', amount_usd: 75 }),
    })
    await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, ledger_type: 'trust', amount_usd: 1200, description: 'Deposit' }),
    })
    await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, ledger_type: 'retainer', amount_usd: 600, description: 'Retainer' }),
    })

    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ matter_id: matter.id, hours: 3, rate_usd: 100, amount_usd: 300, billable: true }],
      }),
    })
    const { entries } = await entryRes.json()

    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, time_entry_ids: [entries[0].id] }),
    })
    const { invoice } = await invRes.json()

    await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoice.id, payment_amount_usd: 150 }),
    })

    const today = new Date().toISOString().split('T')[0]
    const bsRes = await tenant.fetch(`/api/accounttrack/statements/balance-sheet?as_of=${today}`)
    expect(bsRes.status).toBe(200)
    const bs = await bsRes.json()

    expect(bs.balances).toBe(true)
    expect(Math.abs(bs.total_assets - (bs.total_liabilities + bs.total_equity))).toBeLessThan(0.01)
  })
})
