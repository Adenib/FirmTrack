import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

type LineWithKey = { debit_usd: number; credit_usd: number; account_key: string | null }

async function getLinesForSource(tenantId: string, sourceType: string, sourceId: string): Promise<LineWithKey[]> {
  const { data: entry } = await supabaseAdmin
    .from('journal_entries')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
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

describe('auto-posting on Phase 1 write routes', () => {
  let tenant: TestTenant
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('AutoPosting')
    const client = await createTestClient(tenant, 'Auto-Posting Test Client')
    const matter = await createTestMatter(tenant, client.id, 'Auto-Posting Test Matter')
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('disbursement: Dr client_costs_advanced / Cr operating_cash', async () => {
    const res = await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, description: 'Filing fee', amount_usd: 150 }),
    })
    expect(res.status).toBe(200)
    const { disbursement } = await res.json()

    const lines = await getLinesForSource(tenant.tenantId, 'disbursement_recorded', disbursement.id)
    expect(findLine(lines, 'client_costs_advanced').debit_usd).toBe(150)
    expect(findLine(lines, 'operating_cash').credit_usd).toBe(150)
  })

  it('trust deposit: Dr trust_bank / Cr trust_liability', async () => {
    const res = await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, ledger_type: 'trust', amount_usd: 500, description: 'Deposit' }),
    })
    expect(res.status).toBe(200)
    const { entry } = await res.json()

    const lines = await getLinesForSource(tenant.tenantId, 'trust_deposit', entry.id)
    expect(findLine(lines, 'trust_bank').debit_usd).toBe(500)
    expect(findLine(lines, 'trust_liability').credit_usd).toBe(500)
  })

  it('trust withdrawal: Dr trust_liability / Cr trust_bank', async () => {
    const res = await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, ledger_type: 'trust', amount_usd: -200, description: 'Withdrawal' }),
    })
    expect(res.status).toBe(200)
    const { entry } = await res.json()

    const lines = await getLinesForSource(tenant.tenantId, 'trust_withdrawal', entry.id)
    expect(findLine(lines, 'trust_liability').debit_usd).toBe(200)
    expect(findLine(lines, 'trust_bank').credit_usd).toBe(200)
  })

  it('retainer deposit: Dr trust_bank / Cr retainer_liability', async () => {
    const res = await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, ledger_type: 'retainer', amount_usd: 300, description: 'Retainer' }),
    })
    expect(res.status).toBe(200)
    const { entry } = await res.json()

    const lines = await getLinesForSource(tenant.tenantId, 'retainer_deposit', entry.id)
    expect(findLine(lines, 'trust_bank').debit_usd).toBe(300)
    expect(findLine(lines, 'retainer_liability').credit_usd).toBe(300)
  })

  it('retainer withdrawal: Dr retainer_liability / Cr trust_bank', async () => {
    const res = await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, ledger_type: 'retainer', amount_usd: -100, description: 'Draw down' }),
    })
    expect(res.status).toBe(200)
    const { entry } = await res.json()

    const lines = await getLinesForSource(tenant.tenantId, 'retainer_withdrawal', entry.id)
    expect(findLine(lines, 'retainer_liability').debit_usd).toBe(100)
    expect(findLine(lines, 'trust_bank').credit_usd).toBe(100)
  })

  it('invoice creation: Dr accounts_receivable / Cr fees_earned', async () => {
    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ matter_id: matterId, hours: 4, rate_usd: 100, amount_usd: 400, billable: true }],
      }),
    })
    expect(entryRes.status).toBe(200)
    const { entries } = await entryRes.json()

    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, time_entry_ids: [entries[0].id] }),
    })
    expect(invRes.status).toBe(200)
    const { invoice } = await invRes.json()
    expect(Number(invoice.total_amount_usd)).toBe(400)

    const lines = await getLinesForSource(tenant.tenantId, 'invoice_created', invoice.id)
    expect(findLine(lines, 'accounts_receivable').debit_usd).toBe(400)
    expect(findLine(lines, 'fees_earned').credit_usd).toBe(400)

    // --- payment on this same invoice: Dr operating_cash / Cr accounts_receivable ---
    const payRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoice.id, payment_amount_usd: 400 }),
    })
    expect(payRes.status).toBe(200)

    const { data: paymentEntries } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('source_type', 'invoice_payment')
      .eq('source_id', invoice.id)
    expect(paymentEntries).toHaveLength(1)
    const paymentLines = await getLinesForSource(tenant.tenantId, 'invoice_payment', invoice.id)
    expect(findLine(paymentLines, 'operating_cash').debit_usd).toBe(400)
    expect(findLine(paymentLines, 'accounts_receivable').credit_usd).toBe(400)

    // --- voiding a paid invoice must be rejected ---
    const voidRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoice.id, void: true }),
    })
    expect(voidRes.status).toBe(400)
  })

  it('invoice void (unpaid): Dr fees_earned / Cr accounts_receivable', async () => {
    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ matter_id: matterId, hours: 2, rate_usd: 100, amount_usd: 200, billable: true }],
      }),
    })
    const { entries } = await entryRes.json()

    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, time_entry_ids: [entries[0].id] }),
    })
    const { invoice } = await invRes.json()

    const voidRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoice.id, void: true }),
    })
    expect(voidRes.status).toBe(200)

    const lines = await getLinesForSource(tenant.tenantId, 'invoice_void', invoice.id)
    expect(findLine(lines, 'fees_earned').debit_usd).toBe(200)
    expect(findLine(lines, 'accounts_receivable').credit_usd).toBe(200)
  })
})
