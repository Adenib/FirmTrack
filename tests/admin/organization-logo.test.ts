import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  supabaseAdmin,
  type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

function tinyPng(): Buffer {
  // Smallest valid 1x1 transparent PNG.
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
}

describe('Organization logo upload', () => {
  let tenant: TestTenant
  let staffUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('OrgLogo')
    staffUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('requires authentication', async () => {
    const res = await fetch(`${APP_URL}/api/admin/organization-logo`)
    expect(res.status).toBe(401)
  })

  it('does not let a non-privileged role view or upload', async () => {
    const getRes = await staffUser.fetch('/api/admin/organization-logo')
    expect(getRes.status).toBe(403)

    const formData = new FormData()
    formData.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'logo.png')
    const postRes = await staffUser.fetch('/api/admin/organization-logo', { method: 'POST', body: formData })
    expect(postRes.status).toBe(403)
  })

  it('returns no logo before anything is uploaded', async () => {
    const res = await tenant.fetch('/api/admin/organization-logo')
    expect(res.status).toBe(200)
    expect((await res.json()).logoUrl).toBeNull()
  })

  it('rejects a disallowed file type', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'logo.txt')
    const res = await tenant.fetch('/api/admin/organization-logo', { method: 'POST', body: formData })
    expect(res.status).toBe(400)
  })

  it('rejects a file over the size limit', async () => {
    const oversized = Buffer.alloc(3 * 1024 * 1024)
    const formData = new FormData()
    formData.append('file', new Blob([oversized], { type: 'image/png' }), 'logo.png')
    const res = await tenant.fetch('/api/admin/organization-logo', { method: 'POST', body: formData })
    expect(res.status).toBe(400)
  })

  it('uploads a valid logo, tenant-scoped, and returns a signed URL', async () => {
    const formData = new FormData()
    formData.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'logo.png')
    const res = await tenant.fetch('/api/admin/organization-logo', { method: 'POST', body: formData })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.logoUrl).toBeTruthy()

    const { data: org } = await supabaseAdmin.from('organizations').select('logo_path').eq('id', tenant.tenantId).single()
    expect(org.logo_path).toBe(`${tenant.tenantId}/logo.png`)
  })

  it('re-uploading in a different format removes the old object', async () => {
    const formData = new FormData()
    formData.append('file', new Blob([tinyPng()], { type: 'image/jpeg' }), 'logo.jpg')
    const res = await tenant.fetch('/api/admin/organization-logo', { method: 'POST', body: formData })
    expect(res.status).toBe(200)

    const { data: org } = await supabaseAdmin.from('organizations').select('logo_path').eq('id', tenant.tenantId).single()
    expect(org.logo_path).toBe(`${tenant.tenantId}/logo.jpg`)

    const { data: oldFile } = await supabaseAdmin.storage.from('logos').download(`${tenant.tenantId}/logo.png`)
    expect(oldFile).toBeNull()
  })

  it('removes the logo entirely', async () => {
    const res = await tenant.fetch('/api/admin/organization-logo', { method: 'DELETE' })
    expect(res.status).toBe(200)

    const { data: org } = await supabaseAdmin.from('organizations').select('logo_path').eq('id', tenant.tenantId).single()
    expect(org.logo_path).toBeNull()

    const getRes = await tenant.fetch('/api/admin/organization-logo')
    expect((await getRes.json()).logoUrl).toBeNull()
  })
})
