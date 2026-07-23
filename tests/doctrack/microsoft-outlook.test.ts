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

// Same limitation as Phase 2a's OneDrive tests -- no real Microsoft
// Graph round-trip can be scripted. These cover everything testable
// without one: auth/permission gating on the new routes and a linked
// Outlook email's download behavior via a directly-inserted row.
describe('DocTrack Phase 2b: Outlook email linking (auth/permission gating + linked-document download)', () => {
  let tenant: TestTenant
  let assignedLawyer: TestTenant
  let otherStaff: TestTenant
  let matterId: string
  let linkedDocId: string

  beforeAll(async () => {
    tenant = await createTestTenant('OutlookTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'doctrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })
    assignedLawyer = await createTestUser(tenant, { role: 'staff' })
    otherStaff = await createTestUser(tenant, { role: 'staff' })

    const client = await createTestClient(tenant, 'Outlook Test Client')
    const matter = await createTestMatter(tenant, client.id, 'Outlook Test Matter', {
      responsible_lawyer: assignedLawyer.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [assignedLawyer.userId, otherStaff.userId])
  })

  it('GET /api/doctrack/microsoft/messages requires authentication and a connected Microsoft account', async () => {
    const unauthedRes = await fetch('http://localhost:3000/api/doctrack/microsoft/messages')
    expect(unauthedRes.status).toBe(401)

    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/messages')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/connect/i)
  })

  it('GET /api/doctrack/microsoft/messages/attachments requires message_id and a connected account', async () => {
    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/messages/attachments?message_id=fake')
    expect(res.status).toBe(403)
  })

  it('GET /api/doctrack/microsoft/status reports no mail access when never connected', async () => {
    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasMailAccess).toBe(false)
    expect(body.hasFileAccess).toBe(false)
  })

  it('POST /api/doctrack/microsoft/link-email enforces the same matter RBAC as regular uploads, before ever touching Graph', async () => {
    const res = await otherStaff.fetch('/api/doctrack/microsoft/link-email', {
      method: 'POST',
      body: JSON.stringify({ message_id: 'fake-message-id', title: 'Should be blocked', matter_id: matterId }),
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/not authorized/i)
  })

  it('a linked (Outlook) email\'s download route returns the external link without touching storage, and logs the event', async () => {
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .insert({
        tenant_id: tenant.tenantId,
        matter_id: matterId,
        title: 'Linked Client Email',
        created_by: assignedLawyer.userId,
        external_source: 'outlook',
        external_item_id: 'fake-message-id',
        external_web_url: 'https://outlook.office.com/mail/id/fake-message-id',
        external_filename: 'RE: Settlement terms',
        external_size_bytes: null,
        external_modified_at: new Date().toISOString(),
      })
      .select()
      .single()
    linkedDocId = doc!.id

    const res = await assignedLawyer.fetch(`/api/doctrack/documents/download?document_id=${linkedDocId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://outlook.office.com/mail/id/fake-message-id')
    expect(body.filename).toBe('RE: Settlement terms')

    const { data: events } = await supabaseAdmin
      .from('document_events')
      .select('*')
      .eq('document_id', linkedDocId)
      .eq('event_type', 'downloaded')
    expect(events?.[0]).toBeTruthy()
    expect(events?.[0].metadata.source).toBe('outlook')

    // Non-assigned staff still can't reach it.
    const otherRes = await otherStaff.fetch(`/api/doctrack/documents/download?document_id=${linkedDocId}`)
    expect(otherRes.status).toBe(403)
  })

  it('deleting a linked email only soft-deletes DocTrack\'s own reference row', async () => {
    const res = await assignedLawyer.fetch('/api/doctrack/documents/detail', {
      method: 'DELETE',
      body: JSON.stringify({ id: linkedDocId }),
    })
    expect(res.status).toBe(200)

    const { data: row } = await supabaseAdmin.from('documents').select('deleted_at').eq('id', linkedDocId).single()
    expect(row?.deleted_at).toBeTruthy()
  })
})
