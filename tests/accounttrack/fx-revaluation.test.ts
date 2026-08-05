import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, getChartOfAccounts,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

describe('Foreign-currency account revaluation', () => {
  let tenant: TestTenant
  let clientId: string
  let matterId: string
  let operatingCashId: string
  let unrealizedGainId: string

  const today = new Date().toISOString().split('T')[0]
  const pastDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })()

  beforeAll(async () => {
    tenant = await createTestTenant('FxRevaluation')

    await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      body: JSON.stringify({ currency: 'USD' }),
    })
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1650, effective_date: pastDate,
    })

    const accounts = await getChartOfAccounts(tenant)
    operatingCashId = accounts.find((a) => a.key === 'operating_cash')!.id
    unrealizedGainId = accounts.find((a) => a.key === 'unrealized_fx_gain')!.id

    // Mark the tenant's real bank account as USD-denominated -- the whole
    // point of this feature: revaluation only ever applies to accounts an
    // admin has explicitly flagged this way.
    const patchRes = await tenant.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ id: operatingCashId, currency: 'USD' }),
    })
    expect(patchRes.status).toBe(200)

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
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  async function unrealizedGainBalance() {
    const { data } = await supabaseAdmin
      .from('journal_lines').select('debit, credit').eq('tenant_id', tenant.tenantId).eq('account_id', unrealizedGainId)
    return (data || []).reduce((sum, l) => sum + Number(l.credit || 0) - Number(l.debit || 0), 0)
  }

  async function wholeLedgerBalanced() {
    const { data } = await supabaseAdmin.from('journal_lines').select('debit, credit').eq('tenant_id', tenant.tenantId)
    const debit = (data || []).reduce((s, l) => s + Number(l.debit || 0), 0)
    const credit = (data || []).reduce((s, l) => s + Number(l.credit || 0), 0)
    return Math.abs(debit - credit) < 0.01
  }

  it('builds a USD balance in operating_cash: a $1000 invoice payment in, a $400 disbursement out', async () => {
    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ matter_id: matterId, hours: 10, rate: 100, amount: 1000, billable: true }] }),
    })
    expect(entryRes.status).toBe(200)
    const { entries } = await entryRes.json()

    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, time_entry_ids: [entries[0].id] }),
    })
    const { invoice } = await invRes.json()
    expect(invRes.status).toBe(200)

    const payRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: invoice.id, payment_amount: 1000 }),
    })
    expect(payRes.status).toBe(200)

    const disbRes = await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, description: 'Court filing fee', amount: 400 }),
    })
    expect(disbRes.status).toBe(200)

    // Both transactions happened while the 1650 rate was in effect, so
    // operating_cash's book value should already exactly equal its foreign
    // balance (600 USD) times 1650 -- no revaluation needed yet.
    const { data: lines } = await supabaseAdmin
      .from('journal_lines').select('debit, credit, original_amount').eq('tenant_id', tenant.tenantId).eq('account_id', operatingCashId)
    const rawCarrying = lines!.reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0)
    const rawForeign = lines!.reduce(
      (s, l) => s + (Number(l.debit || 0) > 0 ? Number(l.original_amount || 0) : -Number(l.original_amount || 0)), 0
    )
    expect(rawForeign).toBeCloseTo(600, 2)
    expect(rawCarrying).toBeCloseTo(600 * 1650, 2)
  })

  it('revalues operating_cash when the rate moves, booking the delta as unrealized FX gain', async () => {
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1700, effective_date: today,
    })

    const revalRes = await tenant.fetch('/api/accounttrack/fx-revaluation', {
      method: 'POST',
      body: JSON.stringify({ as_of_date: today }),
    })
    expect(revalRes.status).toBe(200)
    const result = await revalRes.json()

    // 600 USD * (1700 - 1650) = 30,000 gain.
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0].delta).toBeCloseTo(30000, 2)
    expect(await unrealizedGainBalance()).toBeCloseTo(30000, 2)
    expect(await wholeLedgerBalanced()).toBe(true)
  })

  it('is a no-op when revalued again at an unchanged rate', async () => {
    const revalRes = await tenant.fetch('/api/accounttrack/fx-revaluation', {
      method: 'POST',
      body: JSON.stringify({ as_of_date: today }),
    })
    expect(revalRes.status).toBe(200)
    const result = await revalRes.json()
    expect(result.adjustments).toHaveLength(0)
    expect(result.entryId).toBeNull()
    // Balance unchanged from the previous revaluation.
    expect(await unrealizedGainBalance()).toBeCloseTo(30000, 2)
  })

  it('runs automatically on period close and reverses cleanly on reopen', async () => {
    const balanceBeforeClose = await unrealizedGainBalance()

    // A further rate move, effective the day we're about to close through.
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1750, effective_date: today,
    })

    const monthStart = `${today.slice(0, 7)}-01`
    const closeRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'POST',
      body: JSON.stringify({ period_type: 'month', period_start: monthStart, period_end: today }),
    })
    expect(closeRes.status).toBe(200)
    const { period } = await closeRes.json()
    expect(period.revaluation_entry_id).toBeTruthy()

    // 600 USD * (1750 - 1700) = 30,000 further gain, on top of the 30,000 already booked.
    expect(await unrealizedGainBalance()).toBeCloseTo(balanceBeforeClose + 30000, 2)
    expect(await wholeLedgerBalanced()).toBe(true)

    const reopenRes = await tenant.fetch('/api/accounttrack/accounting-periods', {
      method: 'PATCH',
      body: JSON.stringify({ id: period.id }),
    })
    expect(reopenRes.status).toBe(200)

    expect(await unrealizedGainBalance()).toBeCloseTo(balanceBeforeClose, 2)
    expect(await wholeLedgerBalanced()).toBe(true)
  })

  it('rejects revaluation when a foreign-currency account has no configured rate', async () => {
    const { data: eurAccount } = await supabaseAdmin
      .from('chart_of_accounts')
      .insert({ tenant_id: tenant.tenantId, key: null, code: '1020', name: 'EUR Reserve', account_type: 'asset', currency: 'EUR' })
      .select()
      .single()

    // Give it a foreign balance directly (bypassing the write paths, which
    // is fine here -- this test only cares about the revaluation lookup).
    await supabaseAdmin.from('journal_lines').insert({
      tenant_id: tenant.tenantId,
      journal_entry_id: (await supabaseAdmin.from('journal_entries').insert({
        tenant_id: tenant.tenantId, entry_date: today, source_type: 'manual', description: 'seed EUR balance',
      }).select().single()).data!.id,
      account_id: eurAccount!.id,
      debit: 1000,
      credit: 0,
      original_currency: 'EUR',
      original_amount: 100,
    })

    const revalRes = await tenant.fetch('/api/accounttrack/fx-revaluation', {
      method: 'POST',
      body: JSON.stringify({ as_of_date: today }),
    })
    expect(revalRes.status).toBe(400)
    const body = await revalRes.json()
    expect(body.error).toMatch(/exchange rate/i)
  })
})
