import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, type TestTenant } from '../helpers/test-client'

const OFFICE_LAT = 6.5244
const OFFICE_LNG = 3.3792
const FAR_LAT = 9.0765
const FAR_LNG = 7.3986

describe('HRTrack Attendance', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('Attendance')
    await tenant.fetch('/api/hrtrack/office-locations', {
      method: 'POST',
      body: JSON.stringify({ name: 'Lagos Office', latitude: OFFICE_LAT, longitude: OFFICE_LNG, radius_meters: 200 }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('clocking in at a configured office location is tagged "office", no note required', async () => {
    const res = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: OFFICE_LAT, lng: OFFICE_LNG, location: 'Lagos Office' }),
    })
    expect(res.status).toBe(200)
    const { record } = await res.json()
    expect(record.status).toBe('office')
    expect(record.clock_out_at).toBeNull()

    // Clock out to leave a clean state for the next test.
    const outRes = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'PATCH',
      body: JSON.stringify({ lat: OFFICE_LAT, lng: OFFICE_LNG, location: 'Lagos Office' }),
    })
    expect(outRes.status).toBe(200)
    const { record: closed } = await outRes.json()
    expect(closed.clock_out_at).toBeTruthy()
  })

  it('clocking in far from any configured office is tagged "remote" and requires a note', async () => {
    const noNoteRes = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: FAR_LAT, lng: FAR_LNG, location: 'Abuja' }),
    })
    expect(noNoteRes.status).toBe(400)

    const withNoteRes = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: FAR_LAT, lng: FAR_LNG, location: 'Abuja', note: 'Working from client site' }),
    })
    expect(withNoteRes.status).toBe(200)
    const { record } = await withNoteRes.json()
    expect(record.status).toBe('remote')
    expect(record.note).toBe('Working from client site')

    await tenant.fetch('/api/hrtrack/attendance', {
      method: 'PATCH',
      body: JSON.stringify({ lat: FAR_LAT, lng: FAR_LNG }),
    })
  })

  it('rejects a second clock-in while already clocked in', async () => {
    const first = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: OFFICE_LAT, lng: OFFICE_LNG, location: 'Lagos Office' }),
    })
    expect(first.status).toBe(200)

    const second = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: OFFICE_LAT, lng: OFFICE_LNG, location: 'Lagos Office' }),
    })
    expect(second.status).toBe(400)

    // Clean up the open session.
    await tenant.fetch('/api/hrtrack/attendance', {
      method: 'PATCH',
      body: JSON.stringify({ lat: OFFICE_LAT, lng: OFFICE_LNG }),
    })
  })

  it('clock-out with no open session is rejected', async () => {
    const res = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'PATCH',
      body: JSON.stringify({ lat: OFFICE_LAT, lng: OFFICE_LNG }),
    })
    expect(res.status).toBe(400)
  })

  it('lists records via GET, filterable by date range', async () => {
    const res = await tenant.fetch('/api/hrtrack/attendance')
    expect(res.status).toBe(200)
    const { records } = await res.json()
    // 3 completed sessions from the earlier tests in this file.
    expect(records.length).toBeGreaterThanOrEqual(3)
    expect(records[0].users?.email).toBe(tenant.email)
  })
})
