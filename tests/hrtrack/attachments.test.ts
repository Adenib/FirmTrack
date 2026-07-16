import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, type TestTenant } from '../helpers/test-client'

function makeFile(name: string, type: string, content = 'test file content') {
  return new File([content], name, { type })
}

describe('HRTrack Requests: evidence/proof attachments', () => {
  let tenant: TestTenant
  let staffA: TestTenant
  let staffB: TestTenant
  let leaveRequestId: string
  let grievanceRequestId: string

  beforeAll(async () => {
    tenant = await createTestTenant('RequestsAttachments')
    staffA = await createTestUser(tenant, { role: 'staff' })
    staffB = await createTestUser(tenant, { role: 'staff' })

    const leaveTypes = await tenant.fetch('/api/hrtrack/leave-types').then((r) => r.json())
    const annual = leaveTypes.leaveTypes.find((lt: { name: string }) => lt.name === 'Annual')

    const leaveRes = await staffA.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'leave', details: { leave_type_id: annual.id, start_date: '2026-12-01', end_date: '2026-12-02' } }),
    })
    leaveRequestId = (await leaveRes.json()).request.id

    const grievanceRes = await staffA.fetch('/api/hrtrack/requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'grievance', details: { subject: 'Attachment test', description: 'details' } }),
    })
    grievanceRequestId = (await grievanceRes.json()).request.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staffA.userId, staffB.userId])
  })

  it('the submitter can upload a PDF as evidence on their own request', async () => {
    const form = new FormData()
    form.append('request_id', leaveRequestId)
    form.append('file', makeFile('doctors-note.pdf', 'application/pdf'))

    const res = await staffA.fetch('/api/hrtrack/requests/attachment', { method: 'POST', body: form })
    expect(res.status).toBe(200)
    const { request } = await res.json()
    expect(request.attachment.filename).toBe('doctors-note.pdf')
  })

  it('a disallowed file type is rejected', async () => {
    const form = new FormData()
    form.append('request_id', leaveRequestId)
    form.append('file', makeFile('malware.exe', 'application/x-msdownload'))

    const res = await staffA.fetch('/api/hrtrack/requests/attachment', { method: 'POST', body: form })
    expect(res.status).toBe(400)
  })

  it('a different staff member cannot upload evidence to someone else\'s request', async () => {
    const form = new FormData()
    form.append('request_id', leaveRequestId)
    form.append('file', makeFile('fake.pdf', 'application/pdf'))

    const res = await staffB.fetch('/api/hrtrack/requests/attachment', { method: 'POST', body: form })
    expect(res.status).toBe(403)
  })

  it('the submitter can fetch a signed URL for their own attachment', async () => {
    const res = await staffA.fetch(`/api/hrtrack/requests/attachment?request_id=${leaveRequestId}`)
    expect(res.status).toBe(200)
    const { url, filename } = await res.json()
    expect(filename).toBe('doctors-note.pdf')
    expect(url).toContain('http')
  })

  it('a grievance attachment is only visible to the submitter and owner/admin, not other staff', async () => {
    const form = new FormData()
    form.append('request_id', grievanceRequestId)
    form.append('file', makeFile('evidence.jpg', 'image/jpeg'))
    const uploadRes = await staffA.fetch('/api/hrtrack/requests/attachment', { method: 'POST', body: form })
    expect(uploadRes.status).toBe(200)

    const ownerRes = await tenant.fetch(`/api/hrtrack/requests/attachment?request_id=${grievanceRequestId}`)
    expect(ownerRes.status).toBe(200)

    const otherStaffRes = await staffB.fetch(`/api/hrtrack/requests/attachment?request_id=${grievanceRequestId}`)
    expect(otherStaffRes.status).toBe(403)
  })

  it('the submitter can delete their own attachment', async () => {
    const deleteRes = await staffA.fetch('/api/hrtrack/requests/attachment', {
      method: 'DELETE',
      body: JSON.stringify({ requestId: leaveRequestId }),
    })
    expect(deleteRes.status).toBe(200)

    const getRes = await staffA.fetch(`/api/hrtrack/requests/attachment?request_id=${leaveRequestId}`)
    expect(getRes.status).toBe(404)
  })
})
