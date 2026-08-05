import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, getChartOfAccounts,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

describe('Multi-currency invoicing: real conversion + realized FX gain/loss', () => {
  let tenant: TestTenant
  let clientId: string
  let matterId: string
  let accounts: { id: string; key: string | null; code: string; name: string; account_type: string }[]

  const today = new Date().toISOString().split('T')[0]
  const pastDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })()

  beforeAll(async () => {
    tenant = await createTestTenant('MultiCurrencyInvoice')

    await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      body: JSON.stringify({ currency: 'USD' }),
    })
    // Rate in effect BEFORE the invoice is created -- 1650.
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1650, effective_date: pastDate,
    })

    const client = await createTestClient(tenant, 'USD Client')
    clientId = client.id

    const matterRes = await tenant.fetch('/api/admin/matters', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        case_name: 'USD Matter',
        billing_currency: 'USD',
        conflict_search_terms: ['USD Matter'],
        conflict_search_confirmed: true,
        conflict_search_results: { terms: ['USD Matter'], clients: [], matters: [], timeEntries: [] },
      }),
    })
    const matterBody = await matterRes.json()
    if (!matterRes.ok) throw new Error(`Failed to create test matter: ${matterBody.error}`)
    matterId = matterBody.matter.id

    accounts = await getChartOfAccounts(tenant)
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects posting a foreign-currency transaction with no exchange rate configured for that pair', async () => {
    const eurMatterRes = await tenant.fetch('/api/admin/matters', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        case_name: 'EUR Matter (no rate)',
        billing_currency: 'EUR',
        conflict_search_terms: ['EUR Matter'],
        conflict_search_confirmed: true,
        conflict_search_results: { terms: ['EUR Matter'], clients: [], matters: [], timeEntries: [] },
      }),
    })
    const { matter: eurMatter } = await eurMatterRes.json()

    const disbRes = await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: eurMatter.id, description: 'Filing fee', amount: 50 }),
    })
    expect(disbRes.status).toBe(400)
    const disbBody = await disbRes.json()
    expect(disbBody.error).toMatch(/exchange rate/i)
  })

  it('converts a time entry to base currency using the real rate as of its entry_date', async () => {
    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ matter_id: matterId, hours: 10, rate: 100, amount: 1000, billable: true }] }),
    })
    expect(entryRes.status).toBe(200)
    const { entries } = await entryRes.json()
    expect(entries).toHaveLength(1)
    expect(entries[0].currency).toBe('USD')
    expect(Number(entries[0].base_currency_amount)).toBeCloseTo(1000 * 1650, 2)
  })

  let invoiceId: string
  let entryId: string

  it('creates an invoice, converting the total to base currency at the invoice-date rate and posting the converted amount to the GL', async () => {
    const { data: unbilled } = await supabaseAdmin
      .from('time_entries').select('id').eq('tenant_id', tenant.tenantId).eq('matter_id', matterId).eq('status', 'submitted')
    entryId = unbilled![0].id

    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, time_entry_ids: [entryId] }),
    })
    expect(invRes.status).toBe(200)
    const { invoice } = await invRes.json()
    invoiceId = invoice.id

    expect(invoice.currency).toBe('USD')
    expect(Number(invoice.total_amount)).toBe(1000) // raw, invoice-currency figure unchanged
    expect(Number(invoice.base_currency_amount)).toBeCloseTo(1000 * 1650, 2) // 1,650,000

    const arAccount = accounts.find((a) => a.key === 'accounts_receivable')!
    const feesAccount = accounts.find((a) => a.key === 'fees_earned')!
    const { data: lines } = await supabaseAdmin
      .from('journal_lines').select('account_id, debit, credit').eq('tenant_id', tenant.tenantId)
      .in('account_id', [arAccount.id, feesAccount.id])
    const arLine = lines!.find((l) => l.account_id === arAccount.id)
    const feesLine = lines!.find((l) => l.account_id === feesAccount.id)
    expect(Number(arLine!.debit)).toBeCloseTo(1650000, 2)
    expect(Number(feesLine!.credit)).toBeCloseTo(1650000, 2)
  })

  it('posts a realized FX gain when a partial payment is recorded after the rate has moved', async () => {
    // A new, later-dated rate now in effect: 1700 (up from 1650).
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1700, effective_date: today,
    })

    const payRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoiceId, payment_amount: 400 }),
    })
    expect(payRes.status).toBe(200)
    const { invoice } = await payRes.json()
    expect(invoice.status).toBe('partially_paid')
    expect(Number(invoice.paid_amount)).toBe(400)

    // paymentBaseValue = 400*1700 = 680,000; originalArValue = (400/1000)*1,650,000 = 660,000; gain = 20,000
    const fxGainAccount = accounts.find((a) => a.key === 'fx_gain')!
    const { data: gainLines } = await supabaseAdmin
      .from('journal_lines').select('credit').eq('tenant_id', tenant.tenantId).eq('account_id', fxGainAccount.id)
    expect(gainLines).toHaveLength(1)
    expect(Number(gainLines![0].credit)).toBeCloseTo(20000, 2)
  })

  it('completes the invoice with a final payment at the same moved rate, and the GL stays balanced', async () => {
    const payRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoiceId, payment_amount: 600 }),
    })
    expect(payRes.status).toBe(200)
    const { invoice } = await payRes.json()
    expect(invoice.status).toBe('paid')
    expect(Number(invoice.paid_amount)).toBe(1000)

    // Second gain: paymentBaseValue = 600*1700 = 1,020,000; originalArValue = 990,000; gain = 30,000.
    // Combined with the first payment's 20,000 gain, total realized gain = 50,000 --
    // exactly (1000*1700) - (1000*1650), confirming the proportional-slice
    // approach sums correctly across partial payments regardless of split.
    const fxGainAccount = accounts.find((a) => a.key === 'fx_gain')!
    const { data: gainLines } = await supabaseAdmin
      .from('journal_lines').select('credit').eq('tenant_id', tenant.tenantId).eq('account_id', fxGainAccount.id)
    const totalGain = gainLines!.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalGain).toBeCloseTo(50000, 2)

    // Whole-ledger balance check -- every journal entry posted so far
    // (time entry conversion doesn't hit the GL, but invoice creation +
    // both payments do) must still sum debits === credits.
    const { data: allLines } = await supabaseAdmin.from('journal_lines').select('debit, credit').eq('tenant_id', tenant.tenantId)
    const totalDebit = allLines!.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = allLines!.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBeCloseTo(totalCredit, 2)
  })
})
