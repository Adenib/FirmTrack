import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import AdmZip from 'adm-zip'
import {
  createTestTenant,
  destroyTestTenant,
  createTestClient,
  createTestMatter,
  createTestLawyer,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('Admin Backup & Restore', () => {
  let tenant: TestTenant
  let clientId: string
  let matterId: string
  let lawyerId: string
  let documentId: string
  let backupZip: Buffer

  beforeAll(async () => {
    tenant = await createTestTenant('BackupRestoreTenant', 'example.com')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId,
      module: 'doctrack',
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    })

    const client = await createTestClient(tenant, 'Backup Test Client')
    clientId = client.id

    const lawyer = await createTestLawyer(tenant, { nickname: 'BAK', initials: 'BAK' })
    lawyerId = lawyer.id

    const matter = await createTestMatter(tenant, clientId, 'Backup Test Matter', {
      responsible_lawyer: tenant.userId,
    })
    matterId = matter.id

    // A representative slice across modules, mirroring how a real tenant's
    // data would be spread out -- not exhaustive across every table.
    await supabaseAdmin.from('time_entries').insert({
      tenant_id: tenant.tenantId,
      lawyer_id: lawyerId,
      matter_id: matterId,
      entry_date: new Date().toISOString().split('T')[0],
      hours: 2,
      rate_usd: 100,
      amount_usd: 200,
      created_by: tenant.userId,
    })

    await supabaseAdmin.from('invoices').insert({
      tenant_id: tenant.tenantId,
      matter_id: matterId,
      invoice_number: 'BAK-0001',
      fees_amount_usd: 200,
      total_amount_usd: 200,
      created_by: tenant.userId,
    })

    const formData = new FormData()
    formData.append('title', 'Backup Test Document')
    formData.append('matter_id', matterId)
    formData.append('file', new Blob(['hello from backup test'], { type: 'text/plain' }), 'note.txt')
    const uploadRes = await tenant.fetch('/api/doctrack/documents', { method: 'POST', body: formData })
    const uploadBody = await uploadRes.json()
    if (!uploadRes.ok) throw new Error(`Failed to create test document: ${uploadBody.error}`)
    documentId = uploadBody.document.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('GET /api/admin/backup requires authentication and owner/admin role', async () => {
    const unauthedRes = await fetch(`${APP_URL}/api/admin/backup`)
    expect(unauthedRes.status).toBe(401)
  })

  it('produces a zip containing manifest.json, data.json (with the tenant\'s rows), and the uploaded file', async () => {
    const res = await tenant.fetch('/api/admin/backup')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')

    const arrayBuffer = await res.arrayBuffer()
    backupZip = Buffer.from(arrayBuffer)
    const zip = new AdmZip(backupZip)

    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf-8'))
    expect(manifest.tables).toContain('matters')
    expect(manifest.excluded_tables).toContain('microsoft_graph_tokens')

    const data = JSON.parse(zip.getEntry('data.json')!.getData().toString('utf-8'))
    expect(data.organization.id).toBe(tenant.tenantId)
    expect(data.clients.some((c: { id: string }) => c.id === clientId)).toBe(true)
    expect(data.matters.some((m: { id: string }) => m.id === matterId)).toBe(true)
    expect(data.lawyers.some((l: { id: string }) => l.id === lawyerId)).toBe(true)
    expect(data.time_entries).toHaveLength(1)
    expect(data.invoices).toHaveLength(1)
    expect(data.documents.some((d: { id: string }) => d.id === documentId)).toBe(true)
    expect(data.document_versions.some((v: { document_id: string }) => v.document_id === documentId)).toBe(true)

    const version = data.document_versions.find((v: { document_id: string }) => v.document_id === documentId)
    const fileEntry = zip.getEntry(`files/documents/${version.storage_path}`)
    expect(fileEntry).toBeTruthy()
    expect(fileEntry!.getData().toString('utf-8')).toBe('hello from backup test')
  })

  it('POST /api/admin/restore requires authentication and owner/admin role', async () => {
    const unauthedRes = await fetch(`${APP_URL}/api/admin/restore`, { method: 'POST' })
    expect(unauthedRes.status).toBe(401)
  })

  describe('restoring the backup into a new organization', () => {
    let restoredOrgId: string
    let restoredOwnerId: string
    const restoredOwnerEmail = `restored-owner-${Date.now()}@example.com`

    afterAll(async () => {
      if (restoredOrgId) await destroyTestTenant({ tenantId: restoredOrgId, userId: restoredOwnerId })
    })

    it('creates a new org with correctly remapped data, distinct from the source tenant', async () => {
      const formData = new FormData()
      formData.append('file', new Blob([new Uint8Array(backupZip)]), 'backup.zip')
      formData.append('new_org_name', 'Restored Backup Org')
      formData.append('new_owner_email', restoredOwnerEmail)

      const res = await tenant.fetch('/api/admin/restore', { method: 'POST', body: formData })
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.newOrgId).not.toBe(tenant.tenantId)
      // The source tenant's owner (tenant.email) is still live in this
      // Supabase project, so recreating that same email always collides --
      // this is the same "source org still active" case the dedicated
      // collision test below exercises, just incidentally true here too.
      expect(body.skippedUsers).toHaveLength(1)
      expect(body.skippedUsers[0].email).toBe(tenant.email)
      restoredOrgId = body.newOrgId

      const { data: newOwner } = await supabaseAdmin
        .from('users')
        .select('id, tenant_id, role')
        .eq('tenant_id', restoredOrgId)
        .eq('email', restoredOwnerEmail)
        .single()
      expect(newOwner?.role).toBe('owner')
      restoredOwnerId = newOwner!.id

      const { data: newMatters } = await supabaseAdmin.from('matters').select('*').eq('tenant_id', restoredOrgId)
      expect(newMatters).toHaveLength(1)
      expect(newMatters![0].id).not.toBe(matterId)
      expect(newMatters![0].case_name).toBe('Backup Test Matter')
      // responsible_lawyer pointed at the original owner (tenant.userId),
      // whose email collided (see skippedUsers assertion above) -- it
      // should have fallen back to the new owner instead.
      expect(newMatters![0].responsible_lawyer).toBe(restoredOwnerId)

      const { data: newDocs } = await supabaseAdmin
        .from('documents')
        .select('*, document_versions(*)')
        .eq('tenant_id', restoredOrgId)
      expect(newDocs).toHaveLength(1)
      expect(newDocs![0].id).not.toBe(documentId)
      expect(newDocs![0].matter_id).toBe(newMatters![0].id)

      const newVersion = newDocs![0].document_versions[0]
      const { data: fileBlob } = await supabaseAdmin.storage.from('documents').download(newVersion.storage_path)
      expect(await fileBlob!.text()).toBe('hello from backup test')

      const { data: newInvoices } = await supabaseAdmin.from('invoices').select('*').eq('tenant_id', restoredOrgId)
      expect(newInvoices).toHaveLength(1)
      expect(newInvoices![0].invoice_number).toBe('BAK-0001')
    })
  })

  it('recreating a user whose email is already registered falls back to the new owner and is reported', async () => {
    // tenant.email (the source org's own owner) is already a registered
    // auth user -- restoring under a fresh owner email should still hit
    // this collision for that one user and report it, not fail the restore.
    const collisionOwnerEmail = `collision-owner-${Date.now()}@example.com`
    const formData = new FormData()
    formData.append('file', new Blob([new Uint8Array(backupZip)]), 'backup.zip')
    formData.append('new_org_name', 'Restored Collision Org')
    formData.append('new_owner_email', collisionOwnerEmail)

    const res = await tenant.fetch('/api/admin/restore', { method: 'POST', body: formData })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.skippedUsers.some((u: { email: string }) => u.email === tenant.email)).toBe(true)

    const { data: newOwner } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('tenant_id', body.newOrgId)
      .eq('email', collisionOwnerEmail)
      .single()

    const { data: newMatters } = await supabaseAdmin.from('matters').select('*').eq('tenant_id', body.newOrgId)
    // The collided user's matter row falls back to the new owner instead
    // of being dropped or failing the restore.
    expect(newMatters![0].responsible_lawyer).toBe(newOwner!.id)

    await destroyTestTenant({ tenantId: body.newOrgId, userId: newOwner!.id })
  })
})
