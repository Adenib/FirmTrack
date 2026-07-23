import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  createTestTenant,
  destroyTestTenant,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'
import { moduleMonthlyPrice, MODULES } from '../../src/lib/billing/pricing'

const APP_URL = 'http://localhost:3000'

describe('Bundle checkout (pricing calculator "Subscribe now")', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    // Paystack's test-mode API validates the email's TLD plausibility --
    // this suite's usual @firmtrack-test.local fixture domain fails that
    // check ("Invalid Email Address Passed"), so this one test tenant
    // uses example.com (IANA-reserved for exactly this kind of test use)
    // instead, since it's the only test file that hits Paystack for real.
    tenant = await createTestTenant('BundleCheckoutTenant', 'example.com')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('POST /api/payments/initialize requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/payments/initialize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modules: ['timetrack'], tier: 'basic' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects an empty modules array', async () => {
    const res = await tenant.fetch('/api/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ modules: [], tier: 'basic' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown module key', async () => {
    const res = await tenant.fetch('/api/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ modules: ['not-a-real-module'], tier: 'basic' }),
    })
    expect(res.status).toBe(400)
  })

  it('computes the bundle amount server-side from the same pricing formula the calculator displays, not from paystack_plans', async () => {
    const modules = ['timetrack', 'accounttrack', 'doctrack']
    const tier = 'basic' as const

    const res = await tenant.fetch('/api/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ modules, tier, currency: 'NGN' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    const expectedPerUser = modules.reduce((sum, key) => {
      const mod = MODULES.find((m) => m.key === key)!
      return sum + moduleMonthlyPrice(tier, mod)
    }, 0)
    // A freshly-registered test tenant has exactly one user (its owner).
    expect(body.seats).toBe(1)
    expect(body.amount).toBe(expectedPerUser * body.seats)
    expect(body.authorization_url).toMatch(/^https:\/\/checkout\.paystack\.com\//)
  })

  it('a bundle webhook event activates one subscription per module and upgrades the org plan once', async () => {
    const payload = {
      event: 'charge.success',
      data: {
        metadata: {
          tenant_id: tenant.tenantId,
          tier: 'elite',
          modules: ['timetrack', 'hrtrack'],
          module_prices: { timetrack: 4000, hrtrack: 4000 },
        },
      },
    }
    const body = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
      .update(body)
      .digest('hex')

    const res = await fetch(`${APP_URL}/api/webhooks/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': signature },
      body,
    })
    expect(res.status).toBe(200)

    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('module, tier, is_active, price_per_user')
      .eq('tenant_id', tenant.tenantId)
      .in('module', ['timetrack', 'hrtrack'])
    expect(subs).toHaveLength(2)
    for (const sub of subs || []) {
      expect(sub.tier).toBe('elite')
      expect(sub.is_active).toBe(true)
      expect(sub.price_per_user).toBe(4000)
    }

    const { data: org } = await supabaseAdmin.from('organizations').select('plan').eq('id', tenant.tenantId).single()
    expect(org?.plan).toBe('elite')
  })

  it('rejects a webhook event with an invalid signature', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { metadata: {} } })
    const res = await fetch(`${APP_URL}/api/webhooks/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': 'not-a-real-signature' },
      body,
    })
    expect(res.status).toBe(401)
  })
})
