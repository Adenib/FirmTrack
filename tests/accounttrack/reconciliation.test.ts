import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, createTestUser, destroyTestTenant, supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

describe('AccountTrack Bank Reconciliation', () => {
  let tenant: TestTenant
  let staffUser: TestTenant
  let cashAccountId: string
  let matchedJournalLineId: string

  beforeAll(async () => {
    tenant = await createTestTenant('Reconciliation')
    staffUser = await createTestUser(tenant, { role: 'staff' })

    const { data: account } = await supabaseAdmin
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('key', 'operating_cash')
      .single()
    cashAccountId = account!.id

    const { data: revenue } = await supabaseAdmin
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('key', 'fees_earned')
      .maybeSingle()
    const otherAccountId = revenue?.id || cashAccountId

    const entryRes = await tenant.fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-10-02',
        description: 'Test wire deposit',
        lines: [
          { account_id: cashAccountId, debit: 15000, credit: 0 },
          { account_id: otherAccountId, debit: 0, credit: 15000 },
        ],
      }),
    })
    const entryBody = await entryRes.json()
    if (!entryRes.ok) throw new Error(`Failed to seed journal entry: ${JSON.stringify(entryBody)}`)

    const { data: postedLine } = await supabaseAdmin
      .from('journal_lines')
      .select('id')
      .eq('journal_entry_id', entryBody.journal_entry_id)
      .eq('account_id', cashAccountId)
      .single()
    matchedJournalLineId = postedLine!.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staffUser.userId])
  })

  it('rejects creating an import for a non-cash account', async () => {
    const { data: nonCash } = await supabaseAdmin
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_cash_account', false)
      .limit(1)
      .single()

    const res = await tenant.fetch('/api/accounttrack/reconciliation/imports', {
      method: 'POST',
      body: JSON.stringify({
        account_id: nonCash!.id,
        statement_start: '2026-10-01',
        statement_end: '2026-10-31',
        opening_balance: 0,
        closing_balance: 0,
        lines: [],
      }),
    })
    expect(res.status).toBe(400)
  })

  it('does not let a non-privileged role create an import', async () => {
    const res = await staffUser.fetch('/api/accounttrack/reconciliation/imports', {
      method: 'POST',
      body: JSON.stringify({
        account_id: cashAccountId,
        statement_start: '2026-10-01',
        statement_end: '2026-10-31',
        opening_balance: 0,
        closing_balance: 15000,
        lines: [],
      }),
    })
    expect(res.status).toBe(403)
  })

  let importId: string

  it('creates an import with statement lines', async () => {
    const res = await tenant.fetch('/api/accounttrack/reconciliation/imports', {
      method: 'POST',
      body: JSON.stringify({
        account_id: cashAccountId,
        statement_start: '2026-10-01',
        statement_end: '2026-10-31',
        opening_balance: 0,
        closing_balance: 15000,
        lines: [
          { line_date: '2026-10-01', description: 'Wire deposit', amount: 15000, reference: 'WIRE-1' },
          { line_date: '2026-10-05', description: 'Something unrelated', amount: 777, reference: 'MISC-1' },
        ],
      }),
    })
    const result = await res.json()
    expect(res.status).toBe(200)
    expect(result.linesInserted).toBe(2)
    importId = result.import.id
  })

  it('suggests the matching journal line for the matching statement line, and none for the unrelated one', async () => {
    const res = await tenant.fetch(`/api/accounttrack/reconciliation/imports/${importId}`)
    const result = await res.json()
    expect(res.status).toBe(200)

    const matchable = result.lines.find((l: { amount: string }) => Number(l.amount) === 15000)
    const unmatchable = result.lines.find((l: { amount: string }) => Number(l.amount) === 777)

    expect(matchable.suggestions.map((s: { journalLineId: string }) => s.journalLineId)).toContain(matchedJournalLineId)
    expect(unmatchable.suggestions).toHaveLength(0)
  })

  it('confirms a match', async () => {
    const detailRes = await tenant.fetch(`/api/accounttrack/reconciliation/imports/${importId}`)
    const detail = await detailRes.json()
    const matchable = detail.lines.find((l: { amount: string }) => Number(l.amount) === 15000)

    const res = await tenant.fetch('/api/accounttrack/reconciliation/match', {
      method: 'POST',
      body: JSON.stringify({ statement_line_id: matchable.id, journal_line_id: matchedJournalLineId }),
    })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.line.status).toBe('matched')
  })

  it('refuses to match the same journal line to a second statement line', async () => {
    const addRes = await tenant.fetch(`/api/accounttrack/reconciliation/imports/${importId}/lines`, {
      method: 'POST',
      body: JSON.stringify({ line_date: '2026-10-02', description: 'Duplicate attempt', amount: 15000 }),
    })
    const added = await addRes.json()

    const res = await tenant.fetch('/api/accounttrack/reconciliation/match', {
      method: 'POST',
      body: JSON.stringify({ statement_line_id: added.line.id, journal_line_id: matchedJournalLineId }),
    })
    expect(res.status).toBe(400)
  })

  it('marks the unrelated line as ignored, then unignores it', async () => {
    const detailRes = await tenant.fetch(`/api/accounttrack/reconciliation/imports/${importId}`)
    const detail = await detailRes.json()
    const unmatched = detail.lines.find((l: { amount: string; status: string }) => Number(l.amount) === 777 && l.status === 'unmatched')

    const ignoreRes = await tenant.fetch('/api/accounttrack/reconciliation/match', {
      method: 'PATCH',
      body: JSON.stringify({ statement_line_id: unmatched.id, status: 'ignored' }),
    })
    expect(ignoreRes.status).toBe(200)
    expect((await ignoreRes.json()).line.status).toBe('ignored')

    const unignoreRes = await tenant.fetch('/api/accounttrack/reconciliation/match', {
      method: 'PATCH',
      body: JSON.stringify({ statement_line_id: unmatched.id, status: 'unmatched' }),
    })
    expect((await unignoreRes.json()).line.status).toBe('unmatched')
  })

  it('refuses to delete an import that has a matched line', async () => {
    const res = await tenant.fetch(`/api/accounttrack/reconciliation/imports/${importId}`, { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('deletes an import with nothing matched on it', async () => {
    const createRes = await tenant.fetch('/api/accounttrack/reconciliation/imports', {
      method: 'POST',
      body: JSON.stringify({
        account_id: cashAccountId,
        statement_start: '2026-11-01',
        statement_end: '2026-11-30',
        opening_balance: 0,
        closing_balance: 0,
        lines: [],
      }),
    })
    const created = await createRes.json()

    const res = await tenant.fetch(`/api/accounttrack/reconciliation/imports/${created.import.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
  })
})
