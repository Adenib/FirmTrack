import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('AssetTrack sync settings: notification_email', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AssetTrackNotifyEmail')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'assettrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('saves a single notification email', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/settings', {
      method: 'POST',
      body: JSON.stringify({ notification_email: 'it@aelex.com' }),
    })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.settings.notification_email).toBe('it@aelex.com')
  })

  it('accepts a second, comma-separated address and normalizes spacing', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/settings', {
      method: 'POST',
      body: JSON.stringify({ notification_email: 'it@aelex.com,   backup-it@aelex.com' }),
    })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.settings.notification_email).toBe('it@aelex.com, backup-it@aelex.com')
  })

  it('dedupes a repeated address', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/settings', {
      method: 'POST',
      body: JSON.stringify({ notification_email: 'it@aelex.com, it@aelex.com' }),
    })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.settings.notification_email).toBe('it@aelex.com')
  })

  it('rejects the save if any one address in the list is invalid', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/settings', {
      method: 'POST',
      body: JSON.stringify({ notification_email: 'it@aelex.com, not-an-email' }),
    })
    expect(res.status).toBe(400)
    const result = await res.json()
    expect(result.error).toMatch(/not-an-email/)
  })

  it('clears notifications when set to an empty string', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/settings', {
      method: 'POST',
      body: JSON.stringify({ notification_email: '' }),
    })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.settings.notification_email).toBeNull()
  })
})
