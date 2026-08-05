import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'
import { getExchangeRate, ExchangeRateError } from '@/lib/accounttrack/exchange-rate'

describe('getExchangeRate', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('ExchangeRateLookup')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('returns 1 for same-currency with no DB lookup', async () => {
    const rate = await getExchangeRate(tenant.tenantId, 'NGN', 'NGN', '2026-01-01')
    expect(rate).toBe(1)
  })

  it('throws ExchangeRateError when no rate exists for either direction', async () => {
    await expect(getExchangeRate(tenant.tenantId, 'USD', 'NGN', '2026-01-01')).rejects.toBeInstanceOf(ExchangeRateError)
  })

  it('finds a direct pair rate effective on or before the given date', async () => {
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1650, effective_date: '2026-01-01',
    })
    const rate = await getExchangeRate(tenant.tenantId, 'USD', 'NGN', '2026-01-15')
    expect(rate).toBe(1650)
  })

  it('uses the latest rate effective on or before the date, not a later one', async () => {
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'USD', to_currency: 'NGN', rate: 1700, effective_date: '2026-02-01',
    })
    // Before the Feb rate takes effect, still resolves to the Jan rate.
    const beforeRate = await getExchangeRate(tenant.tenantId, 'USD', 'NGN', '2026-01-20')
    expect(beforeRate).toBe(1650)
    // On/after Feb 1, resolves to the newer rate.
    const afterRate = await getExchangeRate(tenant.tenantId, 'USD', 'NGN', '2026-02-01')
    expect(afterRate).toBe(1700)
  })

  it('falls back to the inverse pair (1/rate) when only that direction was recorded', async () => {
    await supabaseAdmin.from('accounttrack_exchange_rates').insert({
      tenant_id: tenant.tenantId, from_currency: 'GBP', to_currency: 'NGN', rate: 2000, effective_date: '2026-01-01',
    })
    const inverseRate = await getExchangeRate(tenant.tenantId, 'NGN', 'GBP', '2026-01-15')
    expect(inverseRate).toBeCloseTo(1 / 2000, 10)
  })
})
