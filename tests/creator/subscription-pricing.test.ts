import { afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, createTestPlatformAdmin, destroyTestPlatformAdmin, type TestTenant, type TestPlatformAdmin } from '../helpers/test-client'

describe('Per-org tier change, price override, and bundle rebate', () => {
  let tenant: TestTenant
  let admin: TestPlatformAdmin

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant)
    if (admin) await destroyTestPlatformAdmin(admin)
  })

  it('sets up a tenant and platform admin', async () => {
    tenant = await createTestTenant('SubPricingTenant')
    admin = await createTestPlatformAdmin('admin')
    expect(tenant.tenantId).toBeTruthy()
  })

  it('changes a module tier, recomputing price_per_user from the standard price table', async () => {
    // createTestTenant already activates accounttrack for this tenant.
    const res = await admin.fetch('/api/creator/update-subscription', {
      method: 'POST',
      body: JSON.stringify({ orgId: tenant.tenantId, module: 'accounttrack', tier: 'elite' }),
    })
    expect(res.status).toBe(200)

    const { data: sub } = await supabaseAdmin
      .from('subscriptions').select('tier, price_per_user').eq('tenant_id', tenant.tenantId).eq('module', 'accounttrack').single()
    expect(sub?.tier).toBe('elite')
    const { data: priceRow } = await supabaseAdmin
      .from('platform_module_pricing').select('price').eq('module', 'accounttrack').eq('tier', 'elite').eq('currency', 'NGN').single()
    expect(Number(sub?.price_per_user)).toBe(Number(priceRow!.price))
  })

  it('a manual price override sets an exact custom price, independent of tier', async () => {
    const res = await admin.fetch('/api/creator/update-subscription', {
      method: 'POST',
      body: JSON.stringify({ orgId: tenant.tenantId, module: 'accounttrack', price_per_user: 1234 }),
    })
    expect(res.status).toBe(200)

    const { data: sub } = await supabaseAdmin
      .from('subscriptions').select('tier, price_per_user').eq('tenant_id', tenant.tenantId).eq('module', 'accounttrack').single()
    expect(Number(sub?.price_per_user)).toBe(1234)
    expect(sub?.tier).toBe('elite') // tier itself is unchanged by an override
  })

  it('changing tier again clears the manual override, recomputing from the new tier\'s standard price', async () => {
    const res = await admin.fetch('/api/creator/update-subscription', {
      method: 'POST',
      body: JSON.stringify({ orgId: tenant.tenantId, module: 'accounttrack', tier: 'basic' }),
    })
    expect(res.status).toBe(200)

    const { data: sub } = await supabaseAdmin
      .from('subscriptions').select('tier, price_per_user').eq('tenant_id', tenant.tenantId).eq('module', 'accounttrack').single()
    expect(sub?.tier).toBe('basic')
    const { data: priceRow } = await supabaseAdmin
      .from('platform_module_pricing').select('price').eq('module', 'accounttrack').eq('tier', 'basic').eq('currency', 'NGN').single()
    expect(Number(sub?.price_per_user)).toBe(Number(priceRow!.price))
    expect(Number(sub?.price_per_user)).not.toBe(1234)
  })

  it('rejects a bundle rebate when not every module is active', async () => {
    const res = await admin.fetch('/api/creator/apply-bundle-rebate', {
      method: 'POST',
      body: JSON.stringify({ orgId: tenant.tenantId, discountPercent: 10 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/every module/i)
  })

  it('applies a bundle rebate across every active module once all are enabled, without touching paystack_plans', async () => {
    // Activate every remaining priced module for this tenant.
    for (const module of ['doctrack', 'hrtrack', 'ai_support', 'aitrack']) {
      await admin.fetch('/api/creator/update-subscription', {
        method: 'POST',
        body: JSON.stringify({ orgId: tenant.tenantId, module, is_active: true }),
      })
    }
    // billtrack/timetrack/movementtrack/tasktrack are already active from registration's free-tier grant.

    const { data: plansBefore } = await supabaseAdmin.from('paystack_plans').select('amount').order('amount')

    const res = await admin.fetch('/api/creator/apply-bundle-rebate', {
      method: 'POST',
      body: JSON.stringify({ orgId: tenant.tenantId, discountPercent: 20 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated.length).toBeGreaterThanOrEqual(9)

    const { data: subs } = await supabaseAdmin
      .from('subscriptions').select('module, tier, price_per_user').eq('tenant_id', tenant.tenantId).eq('is_active', true)
    const { data: priceRows } = await supabaseAdmin.from('platform_module_pricing').select('module, tier, price')

    for (const sub of subs || []) {
      const standard = priceRows!.find((p) => p.module === sub.module && p.tier === sub.tier)
      if (!standard) continue
      const expected = Math.round(Number(standard.price) * 0.8)
      expect(Number(sub.price_per_user)).toBe(expected)
    }

    const { data: plansAfter } = await supabaseAdmin.from('paystack_plans').select('amount').order('amount')
    expect(plansAfter).toEqual(plansBefore) // per-org rebate never touches the shared Paystack plans
  })

  it('a non-privileged (non-platform-admin) request cannot change subscriptions or apply a rebate', async () => {
    const res1 = await fetch('http://localhost:3000/api/creator/update-subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: tenant.tenantId, module: 'accounttrack', tier: 'elite' }),
    })
    expect(res1.status).toBe(401)

    const res2 = await fetch('http://localhost:3000/api/creator/apply-bundle-rebate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: tenant.tenantId, discountPercent: 10 }),
    })
    expect(res2.status).toBe(401)
  })
})
