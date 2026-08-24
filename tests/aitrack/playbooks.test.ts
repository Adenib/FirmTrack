import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('AITrack Playbooks', () => {
  let tenant: TestTenant
  let staffUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AiPlaybooksTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'aitrack', tier: 'free', is_active: true, price_per_user: 0,
    })
    staffUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  const ndaPlaybook = {
    name: 'NDA Review Playbook',
    description: 'Commercial and seller-friendly M&A confidentiality review.',
    rules: [
      { label: 'Confidentiality definition', instructions: 'Check confidential information is clearly defined and scoped.' },
      { label: 'Permitted recipients', instructions: 'Check permitted recipients are named or role-limited.' },
    ],
  }

  it('rejects a non-privileged user (plain staff role)', async () => {
    const res = await staffUser.fetch('/api/aitrack/playbooks', { method: 'POST', body: JSON.stringify(ndaPlaybook) })
    expect(res.status).toBe(403)
  })

  it('rejects an empty rules array', async () => {
    const res = await tenant.fetch('/api/aitrack/playbooks', { method: 'POST', body: JSON.stringify({ ...ndaPlaybook, rules: [] }) })
    expect(res.status).toBe(400)
  })

  it('rejects a rule missing instructions', async () => {
    const res = await tenant.fetch('/api/aitrack/playbooks', {
      method: 'POST',
      body: JSON.stringify({ ...ndaPlaybook, rules: [{ label: 'Only a label' }] }),
    })
    expect(res.status).toBe(400)
  })

  it('creates, lists, renames/edits rules, and deletes a playbook', async () => {
    const createRes = await tenant.fetch('/api/aitrack/playbooks', { method: 'POST', body: JSON.stringify(ndaPlaybook) })
    expect(createRes.status).toBe(200)
    const { playbook } = await createRes.json()
    expect(playbook.rules).toHaveLength(2)

    const listRes = await tenant.fetch('/api/aitrack/playbooks')
    const { playbooks } = await listRes.json()
    expect(playbooks.find((p: any) => p.id === playbook.id)).toBeTruthy()

    const patchRes = await tenant.fetch('/api/aitrack/playbooks', {
      method: 'PATCH',
      body: JSON.stringify({ id: playbook.id, name: 'NDA Review Playbook (v2)', rules: [...ndaPlaybook.rules, { label: 'Non-solicit', instructions: 'Check for a non-solicit clause.' }] }),
    })
    expect(patchRes.status).toBe(200)
    const patched = await patchRes.json()
    expect(patched.playbook.name).toBe('NDA Review Playbook (v2)')
    expect(patched.playbook.rules).toHaveLength(3)

    const deleteRes = await tenant.fetch(`/api/aitrack/playbooks?id=${playbook.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const afterDeleteRes = await tenant.fetch('/api/aitrack/playbooks')
    const { playbooks: afterDelete } = await afterDeleteRes.json()
    expect(afterDelete.find((p: any) => p.id === playbook.id)).toBeUndefined()
  })

  it('PATCH on a nonexistent/cross-tenant id returns 404, not a 500', async () => {
    const res = await tenant.fetch('/api/aitrack/playbooks', {
      method: 'PATCH',
      body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', name: 'Hijacked' }),
    })
    expect(res.status).toBe(404)
  })

  it('a plain staff user can read playbooks even though they cannot create them', async () => {
    const res = await staffUser.fetch('/api/aitrack/playbooks')
    expect(res.status).toBe(200)
  })

  it('cross-tenant isolation: another tenant cannot see or delete this tenant\'s playbook', async () => {
    const createRes = await tenant.fetch('/api/aitrack/playbooks', { method: 'POST', body: JSON.stringify(ndaPlaybook) })
    const { playbook } = await createRes.json()

    const otherTenant = await createTestTenant('OtherTenantForPlaybookIsolation')
    try {
      const listRes = await otherTenant.fetch('/api/aitrack/playbooks')
      const { playbooks } = await listRes.json()
      expect(playbooks.find((p: any) => p.id === playbook.id)).toBeUndefined()

      await otherTenant.fetch(`/api/aitrack/playbooks?id=${playbook.id}`, { method: 'DELETE' })
      const stillThereRes = await tenant.fetch('/api/aitrack/playbooks')
      const { playbooks: stillThere } = await stillThereRes.json()
      expect(stillThere.find((p: any) => p.id === playbook.id)).toBeTruthy()
    } finally {
      await destroyTestTenant(otherTenant)
    }
  })
})
