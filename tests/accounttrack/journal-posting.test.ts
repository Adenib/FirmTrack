import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, getChartOfAccounts, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('manual journal entry posting', () => {
  let tenant: TestTenant
  let cashAccountId: string
  let feesAccountId: string

  beforeAll(async () => {
    tenant = await createTestTenant('JournalPosting')
    const accounts = await getChartOfAccounts(tenant)
    cashAccountId = accounts.find((a) => a.key === 'operating_cash')!.id
    feesAccountId = accounts.find((a) => a.key === 'fees_earned')!.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects an unbalanced entry and creates no rows', async () => {
    const res = await tenant.fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Deliberately unbalanced',
        lines: [
          { account_id: cashAccountId, debit: 100 },
          { account_id: feesAccountId, credit: 50 },
        ],
      }),
    })
    expect(res.status).toBe(400)

    const { count } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.tenantId)
    expect(count).toBe(0)
  })

  it('rejects an empty/all-zero entry', async () => {
    const res = await tenant.fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        description: 'All zero',
        lines: [
          { account_id: cashAccountId, debit: 0 },
          { account_id: feesAccountId, credit: 0 },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  it('accepts a balanced entry and posts matching lines', async () => {
    const res = await tenant.fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Balanced test entry',
        lines: [
          { account_id: cashAccountId, debit: 250 },
          { account_id: feesAccountId, credit: 250 },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.journal_entry_id).toBeTruthy()

    const { data: lines } = await supabaseAdmin
      .from('journal_lines')
      .select('debit, credit, account_id')
      .eq('journal_entry_id', body.journal_entry_id)

    expect(lines).toHaveLength(2)
    const totalDebit = lines!.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines!.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(250)
    expect(totalCredit).toBe(250)
  })

  it('rejects an entry referencing an account from another tenant', async () => {
    const otherTenant = await createTestTenant('OtherTenantForIsolationCheck')
    try {
      const otherAccounts = await getChartOfAccounts(otherTenant)
      const otherCashId = otherAccounts.find((a) => a.key === 'operating_cash')!.id

      const res = await tenant.fetch('/api/accounttrack/journal-entries', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Cross-tenant account reference',
          lines: [
            { account_id: otherCashId, debit: 10 },
            { account_id: feesAccountId, credit: 10 },
          ],
        }),
      })
      expect(res.status).toBe(400)
    } finally {
      await destroyTestTenant(otherTenant)
    }
  })
})
