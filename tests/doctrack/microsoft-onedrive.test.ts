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

// These cover everything testable without a real Microsoft Graph
// round-trip (see DocTrack Phase 2a's plan -- same limitation Stage 5's
// SSO work had). Browsing/linking a real OneDrive file needs a manual
// pass with a real connected Microsoft account.
describe('DocTrack Phase 2a: OneDrive linking (auth/permission gating + linked-document download)', () => {
  let tenant: TestTenant
  let assignedLawyer: TestTenant
  let otherStaff: TestTenant
  let matterId: string
  let linkedDocId: string

  beforeAll(async () => {
    tenant = await createTestTenant('OneDriveTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'doctrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })
    assignedLawyer = await createTestUser(tenant, { role: 'staff' })
    otherStaff = await createTestUser(tenant, { role: 'staff' })

    const client = await createTestClient(tenant, 'OneDrive Test Client')
    const matter = await createTestMatter(tenant, client.id, 'OneDrive Test Matter', {
      responsible_lawyer: assignedLawyer.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [assignedLawyer.userId, otherStaff.userId])
  })

  it('GET /api/doctrack/microsoft/browse requires authentication and a connected Microsoft account', async () => {
    const unauthedRes = await fetch('http://localhost:3000/api/doctrack/microsoft/browse')
    expect(unauthedRes.status).toBe(401)

    // Assigned lawyer is authenticated but has never connected Microsoft.
    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/browse')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/connect/i)
  })

  it('GET /api/doctrack/microsoft/status reports no file access when never connected', async () => {
    const unauthedRes = await fetch('http://localhost:3000/api/doctrack/microsoft/status')
    expect(unauthedRes.status).toBe(401)

    const res = await assignedLawyer.fetch('/api/doctrack/microsoft/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasFileAccess).toBe(false)
  })

  it('POST /api/doctrack/microsoft/link enforces the same matter RBAC as regular uploads, before ever touching Graph', async () => {
    const res = await otherStaff.fetch('/api/doctrack/microsoft/link', {
      method: 'POST',
      body: JSON.stringify({ file_id: 'fake-item-id', title: 'Should be blocked', matter_id: matterId }),
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/not authorized/i)
  })

  it('a linked (OneDrive) document\'s download route returns the external link without touching storage, and logs the event', async () => {
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .insert({
        tenant_id: tenant.tenantId,
        matter_id: matterId,
        title: 'Linked Engagement Letter',
        created_by: assignedLawyer.userId,
        external_source: 'onedrive',
        external_item_id: 'fake-item-id',
        external_web_url: 'https://contoso-my.sharepoint.com/personal/fake/Documents/engagement.pdf',
        external_filename: 'engagement.pdf',
        external_size_bytes: 12345,
        external_modified_at: new Date().toISOString(),
      })
      .select()
      .single()
    linkedDocId = doc!.id

    const res = await assignedLawyer.fetch(`/api/doctrack/documents/download?document_id=${linkedDocId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://contoso-my.sharepoint.com/personal/fake/Documents/engagement.pdf')
    expect(body.filename).toBe('engagement.pdf')

    const { data: events } = await supabaseAdmin
      .from('document_events')
      .select('*')
      .eq('document_id', linkedDocId)
      .eq('event_type', 'downloaded')
    expect(events?.[0]).toBeTruthy()
    expect(events?.[0].metadata.source).toBe('onedrive')

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
