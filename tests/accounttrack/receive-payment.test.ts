import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  getChartOfAccounts, supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

async function createBilledInvoice(tenant: TestTenant, matterId: string, amount: number) {
  const disbRes = await tenant.fetch('/api/accounttrack/disbursements', {
    method: 'POST',
    body: JSON.stringify({ matter_id: matterId, description: 'Filing fee', amount, date: '2026-01-01' }),
  })
  const disb = await disbRes.json()
  const invRes = await tenant.fetch('/api/accounttrack/invoices', {
    method: 'POST',
    body: JSON.stringify({ matter_id: matterId, disbursement_ids: [disb.disbursement.id] }),
  })
  const { invoice } = await invRes.json()
  return invoice
}

describe('Receive Payment (multi-invoice + trust/retainer/refund allocation)', () => {
  let tenant: TestTenant
  let matterId: string
  let operatingCashId: string

  beforeAll(async () => {
    tenant = await createTestTenant('ReceivePayment')
    const client = await createTestClient(tenant, 'Receive Payment Test Client')
    const matter = await createTestMatter(tenant, client.id, 'Receive Payment Test Matter')
    matterId = matter.id

    const accounts = await getChartOfAccounts(tenant)
    operatingCashId = accounts.find((a) => a.key === 'operating_cash')!.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects when allocations do not sum to the receipt amount', async () => {
    const invoice = await createBilledInvoice(tenant, matterId, 100)
    const res = await tenant.fetch('/api/accounttrack/receive-payment', {
      method: 'POST',
      body: JSON.stringify({
        account_id: operatingCashId,
        date: '2026-01-02',
        amount: 100,
        allocations: [{ type: 'invoice', invoice_id: invoice.id, amount: 60 }],
      }),
    })
    expect(res.status).toBe(400)
  })

  it('allocates one receipt across 2 invoices + a trust deposit, updating paid_amount/status and trust balance', async () => {
    const invoiceA = await createBilledInvoice(tenant, matterId, 200)
    const invoiceB = await createBilledInvoice(tenant, matterId, 150)

    const { data: beforeTrust } = await supabaseAdmin
      .from('trust_ledger_entries').select('amount').eq('tenant_id', tenant.tenantId).eq('matter_id', matterId).eq('ledger_type', 'trust')
    const trustBefore = (beforeTrust || []).reduce((s, e) => s + Number(e.amount), 0)

    const res = await tenant.fetch('/api/accounttrack/receive-payment', {
      method: 'POST',
      body: JSON.stringify({
        account_id: operatingCashId,
        from: 'ACME Corp',
        date: '2026-01-03',
        amount: 400,
        explanation: 'Combined payment',
        allocations: [
          { type: 'invoice', invoice_id: invoiceA.id, amount: 200 },
          { type: 'invoice', invoice_id: invoiceB.id, amount: 150 },
          { type: 'trust', matter_id: matterId, amount: 50 },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results.every((r: any) => r.status === 'success')).toBe(true)

    const { data: updatedA } = await supabaseAdmin.from('invoices').select('paid_amount, status').eq('id', invoiceA.id).single()
    expect(Number(updatedA!.paid_amount)).toBe(200)
    expect(updatedA!.status).toBe('paid')

    const { data: updatedB } = await supabaseAdmin.from('invoices').select('paid_amount, status').eq('id', invoiceB.id).single()
    expect(Number(updatedB!.paid_amount)).toBe(150)
    expect(updatedB!.status).toBe('paid')

    const { data: afterTrust } = await supabaseAdmin
      .from('trust_ledger_entries').select('amount').eq('tenant_id', tenant.tenantId).eq('matter_id', matterId).eq('ledger_type', 'trust')
    const trustAfter = (afterTrust || []).reduce((s, e) => s + Number(e.amount), 0)
    expect(trustAfter - trustBefore).toBe(50)
  })

  it('a refund allocation posts as a trust deposit tagged transaction_type=refund_intake', async () => {
    const res = await tenant.fetch('/api/accounttrack/receive-payment', {
      method: 'POST',
      body: JSON.stringify({
        account_id: operatingCashId,
        from: 'ACME Corp',
        date: '2026-01-04',
        amount: 75,
        allocations: [{ type: 'refund', matter_id: matterId, amount: 75 }],
      }),
    })
    expect(res.status).toBe(200)

    const { data: entries } = await supabaseAdmin
      .from('trust_ledger_entries')
      .select('amount, ledger_type, transaction_type')
      .eq('tenant_id', tenant.tenantId)
      .eq('matter_id', matterId)
      .eq('transaction_type', 'refund_intake')

    expect(entries).toHaveLength(1)
    expect(entries![0].ledger_type).toBe('trust')
    expect(Number(entries![0].amount)).toBe(75)
  })

  it('a closed accounting period blocks the whole request before any row is written', async () => {
    const invoice = await createBilledInvoice(tenant, matterId, 90)

    const closeRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'POST',
      body: JSON.stringify({ period_type: 'month', period_start: '2025-06-01', period_end: '2025-06-30' }),
    })
    expect(closeRes.status).toBe(200)
    const { period } = await closeRes.json()

    try {
      const res = await tenant.fetch('/api/accounttrack/receive-payment', {
        method: 'POST',
        body: JSON.stringify({
          account_id: operatingCashId,
          date: '2025-06-15',
          amount: 90,
          allocations: [{ type: 'invoice', invoice_id: invoice.id, amount: 90 }],
        }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/closed/i)

      const { data: unchanged } = await supabaseAdmin.from('invoices').select('paid_amount').eq('id', invoice.id).single()
      expect(Number(unchanged!.paid_amount)).toBe(0)
    } finally {
      await tenant.fetch('/api/accounttrack/accounting-periods', { method: 'PATCH', body: JSON.stringify({ id: period.id }) })
    }
  })

  it('partial failure: an allocation that fails only at execution time (missing exchange rate) leaves an earlier, already-applied allocation in place', async () => {
    // Passes up-front validation (the matter genuinely exists) but fails
    // inside postTrustLedgerEntry's getExchangeRate call, since no EUR
    // rate is configured for this tenant -- a realistic execution-time
    // failure that pre-validation can't catch.
    const client = await createTestClient(tenant, 'EUR Client for partial-failure test')
    const eurMatterRes = await tenant.fetch('/api/admin/matters', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id,
        case_name: 'EUR Matter (no rate)',
        billing_currency: 'EUR',
        conflict_search_terms: ['EUR Matter (no rate)'],
        conflict_search_confirmed: true,
        conflict_search_results: { terms: ['EUR Matter (no rate)'], clients: [], matters: [], timeEntries: [] },
      }),
    })
    const { matter: eurMatter } = await eurMatterRes.json()

    const invoiceGood = await createBilledInvoice(tenant, matterId, 120)

    const res = await tenant.fetch('/api/accounttrack/receive-payment', {
      method: 'POST',
      body: JSON.stringify({
        account_id: operatingCashId,
        date: '2026-01-05',
        amount: 200,
        allocations: [
          { type: 'invoice', invoice_id: invoiceGood.id, amount: 120 },
          { type: 'trust', matter_id: eurMatter.id, amount: 80 },
        ],
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.results[0].status).toBe('success')
    expect(body.results[1].status).toBe('failed')

    const { data: updated } = await supabaseAdmin.from('invoices').select('paid_amount').eq('id', invoiceGood.id).single()
    expect(Number(updated!.paid_amount)).toBe(120) // first allocation was NOT rolled back
  })
})
