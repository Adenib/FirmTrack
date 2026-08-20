import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, type TestTenant } from '../helpers/test-client'

describe('HRTrack Evaluate Applications: Daily Log', () => {
  let tenant: TestTenant
  let otherUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AppEvalDailyLog')
    otherUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  const baseEntry = {
    application_name: 'August',
    practice_area: 'Corporate',
    task: 'Legal research',
    entry_date: '2026-08-01',
    traditional_time_minutes: 90,
    app_time_minutes: 45,
    accuracy: 4,
    quality: 4,
    citation_accuracy: 5,
    ease_of_use: 5,
    material_error: false,
    overall_rating: 4,
    comments: 'Solid first pass',
  }

  it('computes time_saved_pct server-side, ignoring any client-sent value', async () => {
    const res = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, time_saved_pct: 999 }),
    })
    expect(res.status).toBe(200)
    const { entry } = await res.json()
    expect(Number(entry.time_saved_pct)).toBe(50) // (90-45)/90 * 100
    expect(entry.user_id).toBeTruthy()
  })

  it('rejects a rating field outside 1-5', async () => {
    const res = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, accuracy: 6 }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects traditional_time_minutes <= 0', async () => {
    const res = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'POST',
      body: JSON.stringify({ ...baseEntry, traditional_time_minutes: 0 }),
    })
    expect(res.status).toBe(400)
  })

  it('defaults application_name to "August" when omitted', async () => {
    const { application_name, ...withoutAppName } = baseEntry
    const res = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'POST',
      body: JSON.stringify(withoutAppName),
    })
    expect(res.status).toBe(200)
    const { entry } = await res.json()
    expect(entry.application_name).toBe('August')
  })

  it('a non-owner cannot edit or delete another user\'s entry', async () => {
    const createRes = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'POST',
      body: JSON.stringify(baseEntry),
    })
    const { entry } = await createRes.json()

    const patchRes = await otherUser.fetch('/api/hrtrack/app-evaluations', {
      method: 'PATCH',
      body: JSON.stringify({ id: entry.id, task: 'Hijacked task' }),
    })
    expect(patchRes.status).toBe(404)

    const deleteRes = await otherUser.fetch(`/api/hrtrack/app-evaluations?id=${entry.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200) // no-op delete (0 rows matched), same convention as other routes -- doesn't error

    const listRes = await tenant.fetch('/api/hrtrack/app-evaluations')
    const { entries } = await listRes.json()
    expect(entries.find((e: any) => e.id === entry.id)).toBeTruthy() // still exists, not deleted by the other user
  })

  it('the owner can edit their own entry, recomputing time_saved_pct when times change', async () => {
    const createRes = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'POST',
      body: JSON.stringify(baseEntry),
    })
    const { entry } = await createRes.json()

    const patchRes = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'PATCH',
      body: JSON.stringify({ id: entry.id, traditional_time_minutes: 100, app_time_minutes: 25 }),
    })
    expect(patchRes.status).toBe(200)
    const { entry: updated } = await patchRes.json()
    expect(Number(updated.time_saved_pct)).toBe(75) // (100-25)/100 * 100
  })

  it('the owner can delete their own entry', async () => {
    const createRes = await tenant.fetch('/api/hrtrack/app-evaluations', {
      method: 'POST',
      body: JSON.stringify(baseEntry),
    })
    const { entry } = await createRes.json()

    const deleteRes = await tenant.fetch(`/api/hrtrack/app-evaluations?id=${entry.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const listRes = await tenant.fetch('/api/hrtrack/app-evaluations')
    const { entries } = await listRes.json()
    expect(entries.find((e: any) => e.id === entry.id)).toBeUndefined()
  })

  it('GET supports filtering by from/to entry_date range (used by the scorecard auto-fill)', async () => {
    await tenant.fetch('/api/hrtrack/app-evaluations', { method: 'POST', body: JSON.stringify({ ...baseEntry, entry_date: '2026-05-01' }) })
    await tenant.fetch('/api/hrtrack/app-evaluations', { method: 'POST', body: JSON.stringify({ ...baseEntry, entry_date: '2026-05-15' }) })
    await tenant.fetch('/api/hrtrack/app-evaluations', { method: 'POST', body: JSON.stringify({ ...baseEntry, entry_date: '2026-06-01' }) })

    const res = await tenant.fetch('/api/hrtrack/app-evaluations?from=2026-05-01&to=2026-05-31')
    const { entries } = await res.json()
    expect(entries.every((e: any) => e.entry_date >= '2026-05-01' && e.entry_date <= '2026-05-31')).toBe(true)
    expect(entries.length).toBeGreaterThanOrEqual(2)
  })
})
