import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'

const LAT = 6.5244
const LNG = 3.3792

describe('WFH activity checks', () => {
  let tenant: TestTenant
  let apiKey: string
  let attendanceRecordId: string

  beforeAll(async () => {
    tenant = await createTestTenant('WfhChecks')

    const keyRes = await tenant.fetch('/api/timetrack/agent-keys', {
      method: 'POST',
      body: JSON.stringify({ label: 'Test agent' }),
    })
    const { key } = await keyRes.json()
    apiKey = key.raw_key

    const clockInRes = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: LAT, lng: LNG, note: 'Working from home' }),
    })
    const { record } = await clockInRes.json()
    attendanceRecordId = record.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects agent endpoints with a missing or invalid x-api-key', async () => {
    const noKey = await fetch('http://localhost:3000/api/hrtrack/attendance/current')
    expect(noKey.status).toBe(401)

    const badKey = await fetch('http://localhost:3000/api/hrtrack/attendance/current', {
      headers: { 'x-api-key': 'not-a-real-key' },
    })
    expect(badKey.status).toBe(401)
  })

  it('GET /attendance/current returns the caller\'s open remote record', async () => {
    const res = await fetch('http://localhost:3000/api/hrtrack/attendance/current', {
      headers: { 'x-api-key': apiKey },
    })
    expect(res.status).toBe(200)
    const { record } = await res.json()
    expect(record.id).toBe(attendanceRecordId)
    expect(record.status).toBe('remote')
  })

  let checkId: string

  it('POST /wfh-checks creates a pending check for that attendance record', async () => {
    const res = await fetch('http://localhost:3000/api/hrtrack/wfh-checks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ attendance_record_id: attendanceRecordId }),
    })
    expect(res.status).toBe(200)
    const { check } = await res.json()
    expect(check.status).toBe('pending')
    checkId = check.id
  })

  it('rejects POST /wfh-checks for an attendance record that is not this user\'s open remote record', async () => {
    const res = await fetch('http://localhost:3000/api/hrtrack/wfh-checks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ attendance_record_id: '00000000-0000-0000-0000-000000000000' }),
    })
    expect(res.status).toBe(400)
  })

  it('owner/admin/hr can see the pending check via the live GET, staff cannot', async () => {
    const ownerRes = await tenant.fetch('/api/hrtrack/wfh-checks')
    expect(ownerRes.status).toBe(200)
    const { checks } = await ownerRes.json()
    expect(checks.some((c: { id: string }) => c.id === checkId)).toBe(true)

    const staff = await createTestUser(tenant, { role: 'staff' })
    const staffRes = await staff.fetch('/api/hrtrack/wfh-checks')
    expect(staffRes.status).toBe(403)

    const hr = await createTestUser(tenant, { role: 'hr' })
    const hrRes = await hr.fetch('/api/hrtrack/wfh-checks')
    expect(hrRes.status).toBe(200)
  })

  it('PATCH /wfh-checks/{id} confirms the check, removing it from the pending list', async () => {
    const res = await fetch(`http://localhost:3000/api/hrtrack/wfh-checks/${checkId}`, {
      method: 'PATCH',
      headers: { 'x-api-key': apiKey },
    })
    expect(res.status).toBe(200)
    const { check } = await res.json()
    expect(check.status).toBe('confirmed')
    expect(check.responded_at).toBeTruthy()

    const listRes = await tenant.fetch('/api/hrtrack/wfh-checks')
    const { checks } = await listRes.json()
    expect(checks.some((c: { id: string }) => c.id === checkId)).toBe(false)
  })

  it('rejects PATCH for a check that does not belong to this key\'s user', async () => {
    // Create a fresh pending check, then try to confirm it with a
    // different (still-valid) agent key belonging to a different user.
    const clockInRes2 = await tenant.fetch('/api/hrtrack/attendance', {
      method: 'PATCH',
      body: JSON.stringify({ lat: LAT, lng: LNG }),
    })
    expect(clockInRes2.status).toBe(200)

    const otherUser = await createTestUser(tenant, { role: 'staff' })
    const otherKeyRes = await otherUser.fetch('/api/timetrack/agent-keys', {
      method: 'POST',
      body: JSON.stringify({ label: 'Other agent' }),
    })
    const { key: otherKey } = await otherKeyRes.json()

    const otherClockIn = await otherUser.fetch('/api/hrtrack/attendance', {
      method: 'POST',
      body: JSON.stringify({ lat: LAT, lng: LNG, note: 'Also WFH' }),
    })
    const { record: otherRecord } = await otherClockIn.json()

    const createRes = await fetch('http://localhost:3000/api/hrtrack/wfh-checks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': otherKey.raw_key },
      body: JSON.stringify({ attendance_record_id: otherRecord.id }),
    })
    const { check: otherCheck } = await createRes.json()

    const crossConfirm = await fetch(`http://localhost:3000/api/hrtrack/wfh-checks/${otherCheck.id}`, {
      method: 'PATCH',
      headers: { 'x-api-key': apiKey },
    })
    expect(crossConfirm.status).toBe(404)
  })

  it('hr is scoped to HRTrack -- can access HRTrack-privileged routes but not AccountTrack owner/admin/accounts-only routes', async () => {
    const hr = await createTestUser(tenant, { role: 'hr' })

    const officeRes = await hr.fetch('/api/hrtrack/office-locations', {
      method: 'POST',
      body: JSON.stringify({ name: 'HR Test Office', latitude: LAT, longitude: LNG, radius_meters: 100 }),
    })
    expect(officeRes.status).toBe(200)

    const coaRes = await hr.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Should not be allowed', account_type: 'expense' }),
    })
    expect(coaRes.status).toBe(403)
  })

  it('the digest-query shape (today\'s pending checks grouped by user) matches what the cron will compute', async () => {
    const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'
    const { data: checks } = await supabaseAdmin
      .from('wfh_activity_checks')
      .select('user_id, users(email)')
      .eq('tenant_id', tenant.tenantId)
      .eq('status', 'pending')
      .gte('prompted_at', todayStart)
    // At least the otherUser's still-pending check from the previous test.
    expect((checks || []).length).toBeGreaterThanOrEqual(1)
  })
})
