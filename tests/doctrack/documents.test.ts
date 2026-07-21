import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  destroyTestTenant,
  createTestUser,
  createTestClient,
  createTestMatter,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

const CRON_URL = 'http://localhost:3000/api/cron/doctrack-retention'
const CRON_SECRET = process.env.CRON_SECRET!

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type })
}

describe('DocTrack v1', () => {
  let tenant: TestTenant
  let assignedLawyer: TestTenant
  let otherStaff: TestTenant
  let clientId: string
  let matterId: string
  let firmWideDocId: string

  beforeAll(async () => {
    tenant = await createTestTenant('DocTrackTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'doctrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })

    assignedLawyer = await createTestUser(tenant, { role: 'staff' })
    otherStaff = await createTestUser(tenant, { role: 'staff' })

    const client = await createTestClient(tenant, 'DocTrack Test Client')
    clientId = client.id
    const matter = await createTestMatter(tenant, clientId, 'DocTrack Test Matter', {
      responsible_lawyer: assignedLawyer.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [assignedLawyer.userId, otherStaff.userId])
  })

  it('uploading a document links it to a matter and logs "created"', async () => {
    const formData = new FormData()
    formData.append('title', 'Engagement Letter')
    formData.append('matter_id', matterId)
    formData.append('file', makeFile('engagement.pdf', 'v1 content', 'application/pdf'))

    const res = await assignedLawyer.fetch('/api/doctrack/documents', { method: 'POST', body: formData })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.document.latest_version.version_number).toBe(1)

    const { data: events } = await supabaseAdmin
      .from('document_events')
      .select('*')
      .eq('document_id', body.document.id)
      .eq('event_type', 'created')
    expect(events?.[0]).toBeTruthy()
  })

  it('uploading a second version increments version_number without disturbing the first', async () => {
    const createForm = new FormData()
    createForm.append('title', 'Retainer Agreement')
    createForm.append('matter_id', matterId)
    createForm.append('file', makeFile('retainer-v1.pdf', 'first', 'application/pdf'))
    const createRes = await assignedLawyer.fetch('/api/doctrack/documents', { method: 'POST', body: createForm })
    const { document } = await createRes.json()

    const versionForm = new FormData()
    versionForm.append('document_id', document.id)
    versionForm.append('file', makeFile('retainer-v2.pdf', 'second', 'application/pdf'))
    const versionRes = await assignedLawyer.fetch('/api/doctrack/documents/versions', { method: 'POST', body: versionForm })
    expect(versionRes.status).toBe(200)
    const { version } = await versionRes.json()
    expect(version.version_number).toBe(2)

    const { data: versions } = await supabaseAdmin
      .from('document_versions')
      .select('*')
      .eq('document_id', document.id)
      .order('version_number')
    expect(versions?.length).toBe(2)
    expect(versions?.[0].filename).toBe('retainer-v1.pdf')
    expect(versions?.[1].filename).toBe('retainer-v2.pdf')

    const { data: events } = await supabaseAdmin
      .from('document_events')
      .select('*')
      .eq('document_id', document.id)
      .eq('event_type', 'version_uploaded')
    expect(events?.[0]).toBeTruthy()
  })

  it('a staff member who is not the responsible lawyer cannot see or upload to that matter\'s documents, but the assigned lawyer and an owner/admin can', async () => {
    const formData = new FormData()
    formData.append('title', 'Privileged Memo')
    formData.append('matter_id', matterId)
    formData.append('file', makeFile('memo.pdf', 'privileged', 'application/pdf'))
    const uploadRes = await assignedLawyer.fetch('/api/doctrack/documents', { method: 'POST', body: formData })
    const { document } = await uploadRes.json()

    // Non-assigned staff: upload to this matter is rejected outright...
    const otherUploadForm = new FormData()
    otherUploadForm.append('title', 'Should Fail')
    otherUploadForm.append('matter_id', matterId)
    otherUploadForm.append('file', makeFile('nope.pdf', 'x', 'application/pdf'))
    const otherUploadRes = await otherStaff.fetch('/api/doctrack/documents', { method: 'POST', body: otherUploadForm })
    expect(otherUploadRes.status).toBe(403)

    // ...and the document doesn't show up in their list.
    const otherListRes = await otherStaff.fetch(`/api/doctrack/documents?matter_id=${matterId}`)
    const otherListBody = await otherListRes.json()
    expect((otherListBody.documents as { id: string }[]).some((d) => d.id === document.id)).toBe(false)

    // The assigned lawyer sees it.
    const assignedListRes = await assignedLawyer.fetch(`/api/doctrack/documents?matter_id=${matterId}`)
    const assignedListBody = await assignedListRes.json()
    expect((assignedListBody.documents as { id: string }[]).some((d) => d.id === document.id)).toBe(true)

    // Owner/admin sees it too (tenant.fetch is the owner from createTestTenant).
    const ownerListRes = await tenant.fetch(`/api/doctrack/documents?matter_id=${matterId}`)
    const ownerListBody = await ownerListRes.json()
    expect((ownerListBody.documents as { id: string }[]).some((d) => d.id === document.id)).toBe(true)
  })

  it('a firm-wide document (no matter_id) is visible to any staff member regardless of assignment', async () => {
    const formData = new FormData()
    formData.append('title', 'Firm Policy Handbook')
    formData.append('file', makeFile('handbook.pdf', 'policy', 'application/pdf'))
    const res = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: formData })
    expect(res.status).toBe(200)
    const { document } = await res.json()
    firmWideDocId = document.id

    const otherListRes = await otherStaff.fetch('/api/doctrack/documents')
    const otherListBody = await otherListRes.json()
    expect((otherListBody.documents as { id: string }[]).some((d) => d.id === firmWideDocId)).toBe(true)
  })

  it('soft-deleting a document removes it from the list but the row and storage object still exist', async () => {
    const res = await tenant.fetch('/api/doctrack/documents/detail', {
      method: 'DELETE',
      body: JSON.stringify({ id: firmWideDocId }),
    })
    expect(res.status).toBe(200)

    const listRes = await tenant.fetch('/api/doctrack/documents')
    const listBody = await listRes.json()
    expect((listBody.documents as { id: string }[]).some((d) => d.id === firmWideDocId)).toBe(false)

    const { data: row } = await supabaseAdmin.from('documents').select('*').eq('id', firmWideDocId).single()
    expect(row).toBeTruthy()
    expect(row?.deleted_at).toBeTruthy()

    const { data: versions } = await supabaseAdmin.from('document_versions').select('*').eq('document_id', firmWideDocId)
    expect(versions?.length).toBeGreaterThan(0)
  })

  it('the retention cron rejects an unauthenticated call and soft-deletes only documents past the retention window', async () => {
    const unauthedRes = await fetch(CRON_URL)
    expect(unauthedRes.status).toBe(401)

    const formData = new FormData()
    formData.append('title', 'Old Document')
    formData.append('file', makeFile('old.pdf', 'old', 'application/pdf'))
    const res = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: formData })
    const { document: oldDoc } = await res.json()
    // Backdate it past a 1-day retention window -- the cron compares
    // against created_at, not a field the API exposes for writing.
    await supabaseAdmin
      .from('documents')
      .update({ created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', oldDoc.id)

    const recentFormData = new FormData()
    recentFormData.append('title', 'Recent Document')
    recentFormData.append('file', makeFile('recent.pdf', 'recent', 'application/pdf'))
    const recentRes = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: recentFormData })
    const { document: recentDoc } = await recentRes.json()

    await tenant.fetch('/api/doctrack/settings', {
      method: 'PUT',
      body: JSON.stringify({ retention_days: 1 }),
    })

    const cronRes = await fetch(CRON_URL, { headers: { authorization: `Bearer ${CRON_SECRET}` } })
    expect(cronRes.status).toBe(200)

    const { data: oldRow } = await supabaseAdmin.from('documents').select('deleted_at').eq('id', oldDoc.id).single()
    expect(oldRow?.deleted_at).toBeTruthy()

    const { data: recentRow } = await supabaseAdmin.from('documents').select('deleted_at').eq('id', recentDoc.id).single()
    expect(recentRow?.deleted_at).toBeNull()
  })
})
