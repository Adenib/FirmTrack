import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, type TestTenant } from '../helpers/test-client'

describe('AccountTrack tenant exchange rates', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('ExchangeRates')
    await tenant.fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      body: JSON.stringify({ currency: 'USD' }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects a rate for a currency not enabled for this tenant', async () => {
    const res = await tenant.fetch('/api/accounttrack/exchange-rates', {
      method: 'POST',
      body: JSON.stringify({ from_currency: 'USD', to_currency: 'GBP', rate: 1300 }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a non-positive rate', async () => {
    const res = await tenant.fetch('/api/accounttrack/exchange-rates', {
      method: 'POST',
      body: JSON.stringify({ from_currency: 'USD', to_currency: 'NGN', rate: 0 }),
    })
    expect(res.status).toBe(400)
  })

  it('inserts a dated rate for an allowed pair (base currency <-> enabled currency)', async () => {
    const res = await tenant.fetch('/api/accounttrack/exchange-rates', {
      method: 'POST',
      body: JSON.stringify({ from_currency: 'USD', to_currency: 'NGN', rate: 1650, effective_date: '2026-08-01' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Number(body.rate.rate)).toBe(1650)
    expect(body.rate.effective_date).toBe('2026-08-01')
  })

  it('never updates in place -- a second POST for the same pair creates a new dated row, both visible in history', async () => {
    const res = await tenant.fetch('/api/accounttrack/exchange-rates', {
      method: 'POST',
      body: JSON.stringify({ from_currency: 'USD', to_currency: 'NGN', rate: 1700, effective_date: '2026-08-02' }),
    })
    expect(res.status).toBe(200)

    const historyRes = await tenant.fetch('/api/accounttrack/exchange-rates?from=USD&to=NGN')
    const { rates } = await historyRes.json()
    expect(rates.length).toBe(2)
    // most recent effective_date first
    expect(rates[0].effective_date).toBe('2026-08-02')
    expect(Number(rates[0].rate)).toBe(1700)
    expect(rates[1].effective_date).toBe('2026-08-01')
    expect(Number(rates[1].rate)).toBe(1650)
  })

  it('GET with no params returns only the latest rate per distinct pair', async () => {
    const res = await tenant.fetch('/api/accounttrack/exchange-rates')
    expect(res.status).toBe(200)
    const { rates } = await res.json()
    const usdNgn = rates.filter((r: { from_currency: string; to_currency: string }) => r.from_currency === 'USD' && r.to_currency === 'NGN')
    expect(usdNgn.length).toBe(1)
    expect(Number(usdNgn[0].rate)).toBe(1700)
  })
})
