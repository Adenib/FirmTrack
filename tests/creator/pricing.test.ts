import { afterAll, describe, it, expect } from 'vitest'
import { supabaseAdmin, createTestPlatformAdmin, destroyTestPlatformAdmin, type TestPlatformAdmin } from '../helpers/test-client'
import { moduleMonthlyPriceFromTable, type PriceTable } from '../../src/lib/billing/pricing'

const APP_URL = 'http://localhost:3000'

// Uses ai_support/elite specifically -- distinct from the
// timetrack/accounttrack/doctrack @ basic combo bundle-checkout.test.ts
// asserts against, so this test writing a live price doesn't make that
// other file's frozen-constant expectations go stale mid-suite.
const TEST_MODULE = 'ai_support'
const TEST_TIER = 'elite'

describe('Dynamic standard pricing (Creator Console)', () => {
  let admin: TestPlatformAdmin
  let originalPrice: number

  afterAll(async () => {
    if (originalPrice !== undefined) {
      await supabaseAdmin
        .from('platform_module_pricing')
        .update({ price: originalPrice })
        .eq('module', TEST_MODULE)
        .eq('tier', TEST_TIER)
        .eq('currency', 'NGN')
    }
    if (admin) await destroyTestPlatformAdmin(admin)
  })

  it('GET /api/billing/pricing returns the seeded table matching known values', async () => {
    const res = await fetch(`${APP_URL}/api/billing/pricing`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.priceTable.timetrack.basic).toBe(1500)
    expect(body.priceTable.accounttrack.basic).toBe(2000)
    expect(body.priceTable.timetrack.standard).toBe(2500)
    expect(body.priceTable.timetrack.elite).toBe(4000)

    const { data: row } = await supabaseAdmin
      .from('platform_module_pricing').select('price').eq('module', TEST_MODULE).eq('tier', TEST_TIER).single()
    originalPrice = Number(row!.price)
  })

  it('PATCH /api/creator/pricing requires platform-admin authentication', async () => {
    const res = await fetch(`${APP_URL}/api/creator/pricing`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ module: TEST_MODULE, tier: TEST_TIER, price: 5000 }),
    })
    expect(res.status).toBe(401)
  })

  it('updates the price, GET reflects it, and the checkout formula picks it up -- with no linked paystack_plans row, sync is a no-op', async () => {
    admin = await createTestPlatformAdmin('admin')
    const newPrice = (originalPrice || 4000) + 777

    const { data: existingPlan } = await supabaseAdmin
      .from('paystack_plans').select('plan_code').eq('module', TEST_MODULE).eq('tier', TEST_TIER).eq('currency', 'NGN').maybeSingle()
    expect(existingPlan).toBeNull() // sanity check the test's premise

    const patchRes = await admin.fetch('/api/creator/pricing', {
      method: 'PATCH',
      body: JSON.stringify({ module: TEST_MODULE, tier: TEST_TIER, price: newPrice }),
    })
    expect(patchRes.status).toBe(200)
    const patchBody = await patchRes.json()
    expect(patchBody.paystackSynced).toBe(false)
    expect(patchBody.paystackError).toBeUndefined()

    const getRes = await fetch(`${APP_URL}/api/billing/pricing`)
    const getBody = await getRes.json()
    expect(getBody.priceTable[TEST_MODULE][TEST_TIER]).toBe(newPrice)

    const priceTable: PriceTable = getBody.priceTable
    expect(moduleMonthlyPriceFromTable(TEST_TIER as 'elite', TEST_MODULE as 'ai_support', priceTable)).toBe(newPrice)
  })

  it('rejects a negative price', async () => {
    if (!admin) admin = await createTestPlatformAdmin('admin')
    const res = await admin.fetch('/api/creator/pricing', {
      method: 'PATCH',
      body: JSON.stringify({ module: TEST_MODULE, tier: TEST_TIER, price: -5 }),
    })
    expect(res.status).toBe(400)
  })

  it('attempts a real Paystack sync when a matching paystack_plans row exists (reports a clear failure for a fake plan code, doesn\'t block the DB write)', async () => {
    if (!admin) admin = await createTestPlatformAdmin('admin')
    const fakePlanCode = 'PLN_test_fake_' + Date.now()
    await supabaseAdmin.from('paystack_plans').insert({
      module: TEST_MODULE, tier: TEST_TIER, currency: 'NGN', plan_code: fakePlanCode, amount: originalPrice || 4000,
    })

    try {
      const res = await admin.fetch('/api/creator/pricing', {
        method: 'PATCH',
        body: JSON.stringify({ module: TEST_MODULE, tier: TEST_TIER, price: (originalPrice || 4000) + 111 }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.paystackSynced).toBe(false)
      expect(body.paystackError).toBeTruthy()

      // DB write still succeeded despite the Paystack failure.
      const { data: row } = await supabaseAdmin
        .from('platform_module_pricing').select('price').eq('module', TEST_MODULE).eq('tier', TEST_TIER).single()
      expect(Number(row!.price)).toBe((originalPrice || 4000) + 111)
    } finally {
      await supabaseAdmin.from('paystack_plans').delete().eq('plan_code', fakePlanCode)
    }
  })
})
