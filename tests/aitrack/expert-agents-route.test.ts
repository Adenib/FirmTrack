import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('AITrack Expert Agents CRUD', () => {
  let tenant: TestTenant
  let staffUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AiExpertAgentsTenant')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'aitrack', tier: 'free', is_active: true, price_per_user: 0,
    })
    staffUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  const employmentAgent = {
    name: 'Employment Law Expert',
    description: 'For staff contract and disciplinary questions.',
    instructions: 'You are our firm\'s employment law expert, focused on Nigerian labor law.',
  }

  it('requires authentication', async () => {
    const res = await fetch('http://localhost:3000/api/aitrack/expert-agents', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(employmentAgent),
    })
    expect(res.status).toBe(401)
  })

  it('rejects a non-privileged user (plain staff role)', async () => {
    const res = await staffUser.fetch('/api/aitrack/expert-agents', { method: 'POST', body: JSON.stringify(employmentAgent) })
    expect(res.status).toBe(403)
  })

  it('rejects missing name/instructions', async () => {
    const res = await tenant.fetch('/api/aitrack/expert-agents', { method: 'POST', body: JSON.stringify({ name: 'x' }) })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid visibility value', async () => {
    const res = await tenant.fetch('/api/aitrack/expert-agents', { method: 'POST', body: JSON.stringify({ ...employmentAgent, visibility: 'public' }) })
    expect(res.status).toBe(400)
  })

  it('defaults visibility to private, creates, lists, edits, and deletes an agent', async () => {
    const createRes = await tenant.fetch('/api/aitrack/expert-agents', { method: 'POST', body: JSON.stringify(employmentAgent) })
    expect(createRes.status).toBe(200)
    const { agent } = await createRes.json()
    expect(agent.visibility).toBe('private')

    const listRes = await tenant.fetch('/api/aitrack/expert-agents')
    const { agents } = await listRes.json()
    expect(agents.find((a: any) => a.id === agent.id)).toBeTruthy()

    const patchRes = await tenant.fetch(`/api/aitrack/expert-agents?id=${agent.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Employment Law Expert (v2)', visibility: 'shared' }),
    })
    expect(patchRes.status).toBe(200)
    const patched = await patchRes.json()
    expect(patched.agent.name).toBe('Employment Law Expert (v2)')
    expect(patched.agent.visibility).toBe('shared')

    const deleteRes = await tenant.fetch(`/api/aitrack/expert-agents?id=${agent.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const afterDeleteRes = await tenant.fetch('/api/aitrack/expert-agents')
    const { agents: afterDelete } = await afterDeleteRes.json()
    expect(afterDelete.find((a: any) => a.id === agent.id)).toBeUndefined()
  })

  it('PATCH on a nonexistent/cross-tenant id returns 404, not a 500', async () => {
    const res = await tenant.fetch('/api/aitrack/expert-agents?id=00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hijacked' }),
    })
    expect(res.status).toBe(404)
  })

  it('a plain staff user can read agents even though they cannot create them', async () => {
    const res = await staffUser.fetch('/api/aitrack/expert-agents')
    expect(res.status).toBe(200)
  })

  it('cross-tenant isolation: another tenant cannot see or delete this tenant\'s agent', async () => {
    const createRes = await tenant.fetch('/api/aitrack/expert-agents', { method: 'POST', body: JSON.stringify(employmentAgent) })
    const { agent } = await createRes.json()

    const otherTenant = await createTestTenant('OtherTenantForExpertAgentIsolation')
    try {
      const listRes = await otherTenant.fetch('/api/aitrack/expert-agents')
      const { agents } = await listRes.json()
      expect(agents.find((a: any) => a.id === agent.id)).toBeUndefined()

      await otherTenant.fetch(`/api/aitrack/expert-agents?id=${agent.id}`, { method: 'DELETE' })
      const stillThereRes = await tenant.fetch('/api/aitrack/expert-agents')
      const { agents: stillThere } = await stillThereRes.json()
      expect(stillThere.find((a: any) => a.id === agent.id)).toBeTruthy()
    } finally {
      await destroyTestTenant(otherTenant)
    }
  })
})
