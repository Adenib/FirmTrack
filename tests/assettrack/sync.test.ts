import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { fieldToString, fieldToNumber, fieldToDate } from '@/lib/assettrack/sync'
import {
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

describe('AssetTrack Graph field mapping (pure)', () => {
  it('fieldToString passes through a plain string, trimmed', () => {
    expect(fieldToString('  AT-001  ')).toBe('AT-001')
  })

  it('fieldToString extracts an email from a Person/Group field object', () => {
    expect(fieldToString({ Email: 'ada@aelex.com', DisplayName: 'Ada' })).toBe('ada@aelex.com')
  })

  it('fieldToString falls back to DisplayName when no Email is present', () => {
    expect(fieldToString({ DisplayName: 'Ada Lovelace' })).toBe('Ada Lovelace')
  })

  it('fieldToString returns null for null/undefined/empty', () => {
    expect(fieldToString(null)).toBeNull()
    expect(fieldToString(undefined)).toBeNull()
    expect(fieldToString('   ')).toBeNull()
  })

  it('fieldToNumber parses a currency-formatted string', () => {
    expect(fieldToNumber('₦500,000.00')).toBe(500000)
  })

  it('fieldToNumber returns null for a non-numeric value', () => {
    expect(fieldToNumber('n/a')).toBeNull()
  })

  it('fieldToDate normalizes a SharePoint dateTime string to YYYY-MM-DD', () => {
    expect(fieldToDate('2023-10-14T00:00:00Z')).toBe('2023-10-14')
  })

  it('fieldToDate returns null for an unparseable value', () => {
    expect(fieldToDate('not a date')).toBeNull()
  })
})

describe('AssetTrack SharePoint sync routes: gating (no live Graph round-trip scriptable, same limitation as DocTrack\'s SharePoint tests)', () => {
  let tenant: TestTenant
  let staff: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AssetTrackSync')
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

  it('GET /api/assettrack/sync/sites requires authentication', async () => {
    const res = await fetch('http://localhost:3000/api/assettrack/sync/sites')
    expect(res.status).toBe(401)
  })

  it('GET /api/assettrack/sync/sites requires owner/admin, not just any staff role', async () => {
    const res = await staff.fetch('/api/assettrack/sync/sites')
    expect(res.status).toBe(403)
  })

  it('GET /api/assettrack/sync/sites 403s with a clear message when no Microsoft account is connected', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/sites')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/connect/i)
  })

  it('GET /api/assettrack/sync/lists requires site_id', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/lists')
    expect(res.status).toBe(400)
  })

  it('GET /api/assettrack/sync/resolve-site requires owner/admin and a url', async () => {
    const staffRes = await staff.fetch('/api/assettrack/sync/resolve-site?url=https://example-my.sharepoint.com/personal/a_b_com/Lists/Foo')
    expect(staffRes.status).toBe(403)

    const missingUrlRes = await tenant.fetch('/api/assettrack/sync/resolve-site')
    expect(missingUrlRes.status).toBe(400)

    const badUrlRes = await tenant.fetch('/api/assettrack/sync/resolve-site?url=not-a-url')
    expect(badUrlRes.status).toBe(400)
  })

  it('POST /api/assettrack/sync/run requires owner/admin', async () => {
    const res = await staff.fetch('/api/assettrack/sync/run', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('POST /api/assettrack/sync/run fails clearly when no site/list is configured yet', async () => {
    const res = await tenant.fetch('/api/assettrack/sync/run', { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/connect a sharepoint site/i)
  })

  it('settings can be saved and read back by owner/admin, and are rejected for non-staff', async () => {
    const saveRes = await tenant.fetch('/api/assettrack/sync/settings', {
      method: 'POST',
      body: JSON.stringify({
        sharepoint_site_id: 'fake-site',
        sharepoint_site_name: 'Fake Site',
        sharepoint_list_id: 'fake-list',
        sharepoint_list_name: 'IT_Asset_Management1',
        field_mapping: { asset_tag: 'Title' },
        sla_days: 10,
      }),
    })
    expect(saveRes.status).toBe(200)

    const readRes = await tenant.fetch('/api/assettrack/sync/settings')
    const readBody = await readRes.json()
    expect(readBody.settings.sharepoint_list_name).toBe('IT_Asset_Management1')
    expect(readBody.settings.sla_days).toBe(10)

    const staffRes = await staff.fetch('/api/assettrack/sync/settings')
    expect(staffRes.status).toBe(403)
  })
})
