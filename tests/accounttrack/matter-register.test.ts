import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestClient, createTestMatter, type TestTenant } from '../helpers/test-client'

describe('matter register batched aggregation', () => {
  let tenant: TestTenant
  let matterId: string
  let matterBusinessId: string

  beforeAll(async () => {
    tenant = await createTestTenant('MatterRegister')
    const client = await createTestClient(tenant, 'Matter Register Test Client')
    const matter = await createTestMatter(tenant, client.id, 'Matter Register Test Matter')
    matterId = matter.id
    matterBusinessId = matter.matter_id

    await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { matter_id: matterId, hours: 3, rate_usd: 100, amount_usd: 300, billable: true },
          { matter_id: matterId, hours: 1, rate_usd: 100, amount_usd: 100, billable: false },
        ],
      }),
    })
    await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, description: 'Filing', amount_usd: 60 }),
    })
    await tenant.fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, ledger_type: 'trust', amount_usd: 1000, description: 'Deposit' }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('reports correct batched aggregates for the matter', async () => {
    const res = await tenant.fetch(`/api/accounttrack/matter-register?status=all&q=${encodeURIComponent(matterBusinessId)}`)
    expect(res.status).toBe(200)
    const body = await res.json()

    const row = body.matters.find((m: { matter: { id: string } }) => m.matter.id === matterId)
    expect(row).toBeTruthy()
    expect(row.hours.billable).toBe(3)
    expect(row.hours.non_billable).toBe(1)
    expect(row.unbilled.fees).toBe(300)
    expect(row.unbilled.disbursements).toBe(60)
    expect(row.trust_balance).toBe(1000)
  })
})
