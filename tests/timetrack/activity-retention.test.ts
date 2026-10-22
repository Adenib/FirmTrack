import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'
const DAY_MS = 24 * 60 * 60 * 1000

describe('Scheduled cleanup: timetrack activity_log retention', () => {
  let tenant: TestTenant
  let oldConvertedId: string
  let recentConvertedId: string
  let oldUnconvertedId: string

  beforeAll(async () => {
    tenant = await createTestTenant('ActivityRetention')

    // converted_to_entry_id is a real FK into time_entries -- insert a
    // minimal real row rather than an arbitrary uuid.
    const { data: timeEntry } = await supabaseAdmin
      .from('time_entries')
      .insert({ tenant_id: tenant.tenantId, entry_date: new Date().toISOString().slice(0, 10) })
      .select()
      .single()

    const { data: oldConverted } = await supabaseAdmin
      .from('activity_log')
      .insert({
        tenant_id: tenant.tenantId,
        user_id: tenant.userId,
        window_title: 'Old converted',
        process_name: 'test.exe',
        duration_seconds: 60,
        logged_at: new Date(Date.now() - 45 * DAY_MS).toISOString(),
        converted_to_entry_id: timeEntry!.id,
      })
      .select()
      .single()
    oldConvertedId = oldConverted!.id

    const { data: recentConverted } = await supabaseAdmin
      .from('activity_log')
      .insert({
        tenant_id: tenant.tenantId,
        user_id: tenant.userId,
        window_title: 'Recent converted',
        process_name: 'test.exe',
        duration_seconds: 60,
        logged_at: new Date(Date.now() - 5 * DAY_MS).toISOString(),
        converted_to_entry_id: timeEntry!.id,
      })
      .select()
      .single()
    recentConvertedId = recentConverted!.id

    const { data: oldUnconverted } = await supabaseAdmin
      .from('activity_log')
      .insert({
        tenant_id: tenant.tenantId,
        user_id: tenant.userId,
        window_title: 'Old but never reviewed',
        process_name: 'test.exe',
        duration_seconds: 60,
        logged_at: new Date(Date.now() - 90 * DAY_MS).toISOString(),
        converted_to_entry_id: null,
      })
      .select()
      .single()
    oldUnconvertedId = oldUnconverted!.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects a request without the cron secret', async () => {
    const res = await fetch(`${APP_URL}/api/cron/timetrack-activity-retention`)
    expect(res.status).toBe(401)
  })

  it('soft-deletes only old, already-converted rows -- never unconverted ones regardless of age', async () => {
    const res = await fetch(`${APP_URL}/api/cron/timetrack-activity-retention`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    expect(res.status).toBe(200)

    const { data: rows } = await supabaseAdmin
      .from('activity_log')
      .select('id, deleted_at')
      .in('id', [oldConvertedId, recentConvertedId, oldUnconvertedId])

    const byId = Object.fromEntries((rows || []).map((r) => [r.id, r]))
    expect(byId[oldConvertedId].deleted_at).not.toBeNull()
    expect(byId[recentConvertedId].deleted_at).toBeNull()
    expect(byId[oldUnconvertedId].deleted_at).toBeNull()
  })

  it('a soft-deleted row no longer shows up in the review endpoint', async () => {
    const res = await tenant.fetch('/api/timetrack/activity')
    const result = await res.json()
    const ids = (result.activity || []).map((a: { id: string }) => a.id)
    expect(ids).not.toContain(oldConvertedId)
    expect(ids).toContain(recentConvertedId)
  })
})
