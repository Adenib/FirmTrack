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

// Same limitation as Phase 2a/2b's tests -- no real Microsoft Graph
// round-trip can be scripted. These cover everything testable without
// one: auth/permission gating on the new routes and a linked
// SharePoint document's download behavior via a directly-inserted row.
describe('DocTrack: SharePoint linking (auth/permission gating + linked-document download)', () => {
  let tenant: TestTenant
  let assignedLawyer: TestTenant
  let otherStaff: TestTenant
  let matterId: string
  let linkedDocId: string

  beforeAll(async () => {
    tenant = await createTestTenant('SharePointTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'doctrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })
    assignedLawyer = await createTestUser(tenant, { role: 'staff' })
    otherStaff = await createTestUser(tenant, { role: 'staff' })

    const client = await createTestClient(tenant, 'SharePoint Test Client')
    const matter = await createTestMatter(tenant, client.id, 'SharePoint Test Matter', {
      responsible_lawyer: assignedLawyer.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [assignedLawyer.userId, otherStaff.userId])
  })

  it('GET /api/doctrack/microsoft/sharepoint/sites requires authentication and a connected Microsoft account', async () => {
    const unauthedRes = await fetch('http://localhost:3000/api/doctrack/microsoft/sharepoint/sites')
    expect(unauthedRes.status).toBe(401)

    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/sharepoint/sites')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/connect/i)
  })

  it('GET /api/doctrack/microsoft/sharepoint/browse requires site_id and a connected account', async () => {
    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/sharepoint/browse?site_id=fake-site')
    expect(res.status).toBe(403)
  })

  it('GET /api/doctrack/microsoft/status reports no sites access when never connected', async () => {
    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasSitesAccess).toBe(false)
  })

  it('POST /api/doctrack/microsoft/sharepoint/link enforces the same matter RBAC as regular uploads, before ever touching Graph', async () => {
    const res = await otherStaff.fetch('/api/doctrack/microsoft/sharepoint/link', {
      method: 'POST',
      body: JSON.stringify({ site_id: 'fake-site-id', item_id: 'fake-item-id', title: 'Should be blocked', matter_id: matterId }),
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/not authorized/i)
  })

  it('a linked (SharePoint) document\'s download route returns the external link without touching storage, and logs the event', async () => {
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .insert({
        tenant_id: tenant.tenantId,
        matter_id: matterId,
        title: 'Linked Board Resolution',
        created_by: assignedLawyer.userId,
        external_source: 'sharepoint',
        external_item_id: 'fake-item-id',
        external_web_url: 'https://contoso.sharepoint.com/sites/Legal/Shared%20Documents/resolution.docx',
        external_filename: 'resolution.docx',
        external_size_bytes: 54321,
        external_modified_at: new Date().toISOString(),
      })
      .select()
      .single()
    linkedDocId = doc!.id

    const res = await assignedLawyer.fetch(`/api/doctrack/documents/download?document_id=${linkedDocId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://contoso.sharepoint.com/sites/Legal/Shared%20Documents/resolution.docx')
    expect(body.filename).toBe('resolution.docx')

    const { data: events } = await supabaseAdmin
      .from('document_events')
      .select('*')
      .eq('document_id', linkedDocId)
      .eq('event_type', 'downloaded')
    expect(events?.[0]).toBeTruthy()
    expect(events?.[0].metadata.source).toBe('sharepoint')

    // Non-assigned staff still can't reach it.
    const otherRes = await otherStaff.fetch(`/api/doctrack/documents/download?document_id=${linkedDocId}`)
    expect(otherRes.status).toBe(403)
  })

  it('deleting a linked document only soft-deletes DocTrack\'s own reference row', async () => {
    const res = await assignedLawyer.fetch('/api/doctrack/documents/detail', {
      method: 'DELETE',
      body: JSON.stringify({ id: linkedDocId }),
    })
    expect(res.status).toBe(200)

    const { data: row } = await supabaseAdmin.from('documents').select('deleted_at').eq('id', linkedDocId).single()
    expect(row?.deleted_at).toBeTruthy()
  })
})
