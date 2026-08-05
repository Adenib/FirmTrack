import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, getChartOfAccounts,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

describe('Statements: native-currency balances and whole-report translation', () => {
  let tenant: TestTenant

  const today = new Date().toISOString().split('T')[0]
  const pastDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })()

  beforeAll(async () => {
    tenant = await createTestTenant('StatementsCurrency')

    await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      body: JSON.stringify({ currency: 'USD' }),
    })
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1650, effective_date: pastDate,
    })

    const accounts = await getChartOfAccounts(tenant)
    const operatingCashId = accounts.find((a) => a.key === 'operating_cash')!.id
    await tenant.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ id: operatingCashId, currency: 'USD' }),
    })

    const client = await createTestClient(tenant, 'USD Client')
    const matterRes = await tenant.fetch('/api/admin/matters', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id,
        case_name: 'USD Matter',
        billing_currency: 'USD',
        conflict_search_terms: ['USD Matter'],
        conflict_search_confirmed: true,
        conflict_search_results: { terms: ['USD Matter'], clients: [], matters: [], timeEntries: [] },
      }),
    })
    const { matter } = await matterRes.json()

    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ matter_id: matter.id, hours: 10, rate: 100, amount: 1000, billable: true }] }),
    })
    const { entries } = await entryRes.json()

    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, time_entry_ids: [entries[0].id] }),
    })
    const { invoice } = await invRes.json()

    await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoice.id, payment_amount: 1000 }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('balance sheet shows native + base balance for a foreign-currency account, and no translation by default', async () => {
    const res = await tenant.fetch(`/api/accounttrack/statements/balance-sheet?as_of=${today}`)
    expect(res.status).toBe(200)
    const bs = await res.json()

    expect(bs.base_currency).toBe('NGN')
    expect(bs.display_currency).toBeNull()
    expect(bs.display_rate).toBeNull()

    const cash = bs.assets.find((a: { key: string }) => a.key === 'operating_cash')
    expect(cash.currency).toBe('USD')
    expect(cash.foreign_balance).toBeCloseTo(1000, 2)
    expect(cash.amount).toBeCloseTo(1650000, 2)
  })

  it('translates the whole balance sheet at a single current rate when ?currency= is given', async () => {
    const res = await tenant.fetch(`/api/accounttrack/statements/balance-sheet?as_of=${today}&currency=USD`)
    expect(res.status).toBe(200)
    const bs = await res.json()

    expect(bs.display_currency).toBe('USD')
    // No direct NGN->USD rate was recorded, only USD->NGN -- resolved via inverse fallback (1/1650).
    expect(bs.display_rate).toBeCloseTo(1 / 1650, 8)
    expect(bs.total_assets).toBeCloseTo(1650000 * (1 / 1650), 2)
    // Native foreign_balance stays untranslated -- it's already in its own currency.
    const cash = bs.assets.find((a: { key: string }) => a.key === 'operating_cash')
    expect(cash.foreign_balance).toBeCloseTo(1000, 2)
  })

  it('translates the whole income statement consistently, and is a no-op for the base currency', async () => {
    const [translated, untranslated] = await Promise.all([
      tenant.fetch(`/api/accounttrack/statements/income-statement?from=${pastDate}&to=${today}&currency=USD`),
      tenant.fetch(`/api/accounttrack/statements/income-statement?from=${pastDate}&to=${today}&currency=NGN`),
    ])
    expect(translated.status).toBe(200)
    expect(untranslated.status).toBe(200)
    const translatedBody = await translated.json()
    const untranslatedBody = await untranslated.json()

    expect(untranslatedBody.display_currency).toBeNull()
    expect(untranslatedBody.total_revenue).toBeCloseTo(1650000, 2)

    expect(translatedBody.display_currency).toBe('USD')
    // 1,650,000 NGN translated at 1/1650 rounds back to exactly the original 1000 USD invoice.
    expect(translatedBody.total_revenue).toBeCloseTo(1000, 2)
  })

  it('returns a clean 400 (not a silent 1:1 guess) when translating to a currency with no configured rate', async () => {
    const res = await tenant.fetch(`/api/accounttrack/statements/income-statement?from=${pastDate}&to=${today}&currency=GBP`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/exchange rate/i)
  })
})
