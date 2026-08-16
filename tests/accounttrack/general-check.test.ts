import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  getChartOfAccounts, supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

describe('General Check (operating-cash and trust-bank paths)', () => {
  let tenant: TestTenant
  let matterAId: string
  let matterBId: string
  let operatingCashId: string
  let salariesExpenseId: string

  beforeAll(async () => {
    tenant = await createTestTenant('GeneralCheck')
    const client = await createTestClient(tenant, 'General Check Test Client')
    const matterA = await createTestMatter(tenant, client.id, 'General Check Matter A')
    const matterB = await createTestMatter(tenant, client.id, 'General Check Matter B')
    matterAId = matterA.id
    matterBId = matterB.id

    const accounts = await getChartOfAccounts(tenant)
    operatingCashId = accounts.find((a) => a.key === 'operating_cash')!.id
    salariesExpenseId = accounts.find((a) => a.key === 'salaries_expense')!.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('an operating-cash check split across 2 lines balances and posts correct debits/credits', async () => {
    const res = await tenant.fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-01-15',
        description: 'Check to Office Supplies Inc',
        reference: 'CHK-1001',
        lines: [
          { account_id: operatingCashId, credit: 300 },
          { account_id: salariesExpenseId, matter_id: matterAId, debit: 200, description: 'Line 1' },
          { account_id: salariesExpenseId, matter_id: matterBId, debit: 100, description: 'Line 2' },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const { journal_entry_id } = await res.json()

    const { data: entry } = await supabaseAdmin.from('journal_entries').select('reference').eq('id', journal_entry_id).single()
    expect(entry!.reference).toBe('CHK-1001')

    const { data: lines } = await supabaseAdmin.from('journal_lines').select('debit, credit, matter_id').eq('journal_entry_id', journal_entry_id)
    expect(lines).toHaveLength(3)
    const totalDebit = lines!.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines!.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(300)
    expect(totalCredit).toBe(300)
  })

  it('a trust-bank check split across 2 matters produces 2 correct negative trust_ledger_entries sharing one reference', async () => {
    const reference = 'CHK-2001'
    for (const [matterId, amount] of [[matterAId, 150], [matterBId, 75]] as const) {
      const res = await tenant.fetch('/api/accounttrack/trust-ledger', {
        method: 'POST',
        body: JSON.stringify({
          matter_id: matterId,
          ledger_type: 'trust',
          entry_date: '2026-01-16',
          amount: -amount,
          description: 'Check to Court Filing Office',
          reference,
        }),
      })
      expect(res.status).toBe(200)
    }

    const { data: entries } = await supabaseAdmin
      .from('trust_ledger_entries')
      .select('matter_id, amount, reference')
      .eq('tenant_id', tenant.tenantId)
      .eq('reference', reference)

    expect(entries).toHaveLength(2)
    expect(entries!.every((e) => Number(e.amount) < 0)).toBe(true)
    expect(new Set(entries!.map((e) => e.matter_id))).toEqual(new Set([matterAId, matterBId]))
  })

  it('trust-bank check: a line referencing a nonexistent matter fails without rolling back an already-posted line', async () => {
    const reference = 'CHK-3001'

    const firstRes = await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterAId, ledger_type: 'trust', entry_date: '2026-01-17', amount: -50, reference }),
    })
    expect(firstRes.status).toBe(200)

    const bogusMatterId = '00000000-0000-0000-0000-000000000000'
    const secondRes = await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: bogusMatterId, ledger_type: 'trust', entry_date: '2026-01-17', amount: -25, reference }),
    })
    expect(secondRes.status).not.toBe(200)

    const { data: entries } = await supabaseAdmin
      .from('trust_ledger_entries')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('reference', reference)
    expect(entries).toHaveLength(1) // first line NOT rolled back
  })
})
