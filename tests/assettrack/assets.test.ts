import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

describe('AssetTrack asset register', () => {
  let tenant: TestTenant
  let staff: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AssetTrackAssets')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'assettrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })
    staff = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('a non-staff role cannot create an asset', async () => {
    const res = await staff.fetch('/api/assettrack/assets', {
      method: 'POST',
      body: JSON.stringify({ asset_tag: 'AT-002' }),
    })
    expect(res.status).toBe(403)
  })

  let assetId: string

  it('owner/admin can create an asset', async () => {
    const res = await tenant.fetch('/api/assettrack/assets', {
      method: 'POST',
      body: JSON.stringify({ asset_tag: 'AT-002', make: 'Lenovo', model: 'ThinkPad T14', replacement_cost: 600000 }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    assetId = body.asset.id
  })

  it('rejects a duplicate asset_tag within the same tenant', async () => {
    const res = await tenant.fetch('/api/assettrack/assets', {
      method: 'POST',
      body: JSON.stringify({ asset_tag: 'AT-002', make: 'Lenovo' }),
    })
    expect(res.status).toBe(400)
  })

  it('strips replacement_cost from a non-staff caller\'s view', async () => {
    const res = await staff.fetch('/api/assettrack/assets')
    const body = await res.json()
    const asset = body.assets.find((a: { id: string }) => a.id === assetId)
    expect(asset).toBeDefined()
    expect(asset.replacement_cost).toBeUndefined()
  })

  it('keeps replacement_cost visible to staff', async () => {
    const res = await tenant.fetch('/api/assettrack/assets')
    const body = await res.json()
    const asset = body.assets.find((a: { id: string }) => a.id === assetId)
    expect(Number(asset.replacement_cost)).toBe(600000)
  })

  it('a non-staff role cannot retire an asset', async () => {
    const res = await staff.fetch('/api/assettrack/assets', {
      method: 'PATCH',
      body: JSON.stringify({ id: assetId, asset_status: 'retired' }),
    })
    expect(res.status).toBe(403)
  })

  it('owner/admin can retire an asset', async () => {
    const res = await tenant.fetch('/api/assettrack/assets', {
      method: 'PATCH',
      body: JSON.stringify({ id: assetId, asset_status: 'retired' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.asset.asset_status).toBe('retired')
  })
})
