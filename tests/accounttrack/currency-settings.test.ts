import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('AccountTrack currency settings', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('CurrencySettings')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('GET returns the tenant base_currency and an empty enabled list by default', async () => {
    const res = await tenant.fetch('/api/accounttrack/currency-settings')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.base_currency).toBe('NGN')
    expect(body.enabled_currencies).toEqual([])
    expect(body.base_currency_locked).toBe(false)
  })

  it('rejects an invalid currency code', async () => {
    const res = await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      body: JSON.stringify({ currency: 'usd' }),
    })
    expect(res.status).toBe(400)
  })

  it('enables a currency, then it appears in the GET response', async () => {
    const postRes = await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      body: JSON.stringify({ currency: 'USD' }),
    })
    expect(postRes.status).toBe(200)

    const res = await tenant.fetch('/api/accounttrack/currency-settings')
    const body = await res.json()
    expect(body.enabled_currencies).toEqual(['USD'])
  })

  it('blocks removing a currency still referenced by a client', async () => {
    const clientRes = await tenant.fetch('/api/admin/clients', {
      method: 'POST',
      body: JSON.stringify({ name: 'USD Client', billing_currency: 'USD' }),
    })
    expect(clientRes.status).toBe(200)

    const deleteRes = await tenant.fetch('/api/accounttrack/currency-settings?currency=USD', { method: 'DELETE' })
    expect(deleteRes.status).toBe(400)
  })

  it('allows removing a currency once nothing references it', async () => {
    const postRes = await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      body: JSON.stringify({ currency: 'GBP' }),
    })
    expect(postRes.status).toBe(200)

    const deleteRes = await tenant.fetch('/api/accounttrack/currency-settings?currency=GBP', { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const res = await tenant.fetch('/api/accounttrack/currency-settings')
    const body = await res.json()
    expect(body.enabled_currencies).not.toContain('GBP')
  })

  it('base_currency is editable before any transactions exist', async () => {
    const patchRes = await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'PATCH',
      body: JSON.stringify({ base_currency: 'GHS' }),
    })
    expect(patchRes.status).toBe(200)

    const { data: org } = await supabaseAdmin.from('organizations').select('base_currency').eq('id', tenant.tenantId).single()
    expect(org?.base_currency).toBe('GHS')

    // restore for subsequent tests in this file
    await supabaseAdmin.from('organizations').update({ base_currency: 'NGN' }).eq('id', tenant.tenantId)
  })

  it('locks base_currency once the tenant has a posted journal entry', async () => {
    const accountsRes = await tenant.fetch('/api/accounttrack/chart-of-accounts')
    const { accounts } = await accountsRes.json()
    const cash = accounts.find((a: { key: string }) => a.key === 'operating_cash')
    const fees = accounts.find((a: { key: string }) => a.key === 'fees_earned')

    const postRes = await tenant.fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Lock test entry',
        lines: [
          { account_id: cash.id, debit: 100 },
          { account_id: fees.id, credit: 100 },
        ],
      }),
    })
    expect(postRes.status).toBe(200)

    const getRes = await tenant.fetch('/api/accounttrack/currency-settings')
    const body = await getRes.json()
    expect(body.base_currency_locked).toBe(true)

    const patchRes = await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'PATCH',
      body: JSON.stringify({ base_currency: 'USD' }),
    })
    expect(patchRes.status).toBe(400)
  })
})
