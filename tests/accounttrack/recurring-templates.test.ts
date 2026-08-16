import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, type TestTenant } from '../helpers/test-client'

describe('Recurring transaction templates', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('RecurringTemplates')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('creates, lists (scoped by transaction_type), renames, and deletes a template', async () => {
    const createRes = await tenant.fetch('/api/accounttrack/recurring-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Monthly rent',
        transaction_type: 'journal_entry',
        payload: { description: 'Rent', lines: [] },
      }),
    })
    expect(createRes.status).toBe(200)
    const { template } = await createRes.json()
    expect(template.name).toBe('Monthly rent')

    const otherTypeRes = await tenant.fetch('/api/accounttrack/recurring-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Weekly payroll check', transaction_type: 'general_check', payload: {} }),
    })
    expect(otherTypeRes.status).toBe(200)

    const listRes = await tenant.fetch('/api/accounttrack/recurring-templates?transaction_type=journal_entry')
    const { templates } = await listRes.json()
    expect(templates.map((t: any) => t.name)).toEqual(['Monthly rent'])

    const renameRes = await tenant.fetch('/api/accounttrack/recurring-templates', {
      method: 'PATCH',
      body: JSON.stringify({ id: template.id, name: 'Monthly rent (renamed)' }),
    })
    expect(renameRes.status).toBe(200)
    const renamed = await renameRes.json()
    expect(renamed.template.name).toBe('Monthly rent (renamed)')

    const markUsedRes = await tenant.fetch('/api/accounttrack/recurring-templates', {
      method: 'PATCH',
      body: JSON.stringify({ id: template.id, mark_used: true }),
    })
    const markUsed = await markUsedRes.json()
    expect(markUsed.template.last_used_at).toBeTruthy()

    const deleteRes = await tenant.fetch(`/api/accounttrack/recurring-templates?id=${template.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const afterDeleteRes = await tenant.fetch('/api/accounttrack/recurring-templates?transaction_type=journal_entry')
    const { templates: afterDelete } = await afterDeleteRes.json()
    expect(afterDelete).toHaveLength(0)
  })

  it('rejects an invalid transaction_type', async () => {
    const res = await tenant.fetch('/api/accounttrack/recurring-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bad type', transaction_type: 'not_a_real_type', payload: {} }),
    })
    expect(res.status).toBe(400)
  })

  it('cross-tenant isolation: another tenant cannot see, rename, or delete this tenant\'s template', async () => {
    const createRes = await tenant.fetch('/api/accounttrack/recurring-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'Isolation Test', transaction_type: 'receive_payment', payload: {} }),
    })
    const { template } = await createRes.json()

    const otherTenant = await createTestTenant('OtherTenantForTemplateIsolation')
    try {
      const listRes = await otherTenant.fetch('/api/accounttrack/recurring-templates')
      const { templates } = await listRes.json()
      expect(templates.find((t: any) => t.id === template.id)).toBeUndefined()

      const patchRes = await otherTenant.fetch('/api/accounttrack/recurring-templates', {
        method: 'PATCH',
        body: JSON.stringify({ id: template.id, name: 'Hijacked' }),
      })
      expect(patchRes.status).toBe(404)

      await otherTenant.fetch(`/api/accounttrack/recurring-templates?id=${template.id}`, { method: 'DELETE' })
      const stillThereRes = await tenant.fetch('/api/accounttrack/recurring-templates')
      const { templates: stillThere } = await stillThereRes.json()
      expect(stillThere.find((t: any) => t.id === template.id)).toBeTruthy()
    } finally {
      await destroyTestTenant(otherTenant)
    }
  })
})
