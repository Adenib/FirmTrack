import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

describe('Conflict of interest check', () => {
  let tenant: TestTenant
  let clientId: string
  let matterId: string

  beforeAll(async () => {
    tenant = await createTestTenant('ConflictCheck')
    const client = await createTestClient(tenant, 'Zenith Bank Plc')
    clientId = client.id
    const matter = await createTestMatter(tenant, clientId, 'Zenith Bank v. Acme Holdings')
    matterId = matter.id

    await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{
          matter_id: matterId, hours: 1, rate: 100, amount: 100, billable: true,
          explanation: 'Call with opposing counsel for Acme Holdings re: settlement terms',
        }],
      }),
    })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('finds a match by existing client name', async () => {
    const res = await tenant.fetch('/api/admin/conflict-search', {
      method: 'POST',
      body: JSON.stringify({ names: ['Zenith Bank'] }),
    })
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results.clients.length).toBeGreaterThanOrEqual(1)
    expect(results.clients.some((c: { name: string }) => c.name === 'Zenith Bank Plc')).toBe(true)
  })

  it('finds a match by existing matter case name', async () => {
    const res = await tenant.fetch('/api/admin/conflict-search', {
      method: 'POST',
      body: JSON.stringify({ names: ['Acme Holdings'] }),
    })
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results.matters.some((m: { case_name: string }) => m.case_name === 'Zenith Bank v. Acme Holdings')).toBe(true)
  })

  it('finds a match buried in a time entry explanation not present in any client/matter name', async () => {
    const res = await tenant.fetch('/api/admin/conflict-search', {
      method: 'POST',
      body: JSON.stringify({ names: ['opposing counsel'] }),
    })
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results.timeEntries.length).toBeGreaterThanOrEqual(1)
    expect(results.clients).toHaveLength(0)
    expect(results.matters).toHaveLength(0)
  })

  it('returns no matches for a name that does not appear anywhere', async () => {
    const res = await tenant.fetch('/api/admin/conflict-search', {
      method: 'POST',
      body: JSON.stringify({ names: ['Totally Unrelated Entity Xyzzy'] }),
    })
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results.clients).toHaveLength(0)
    expect(results.matters).toHaveLength(0)
    expect(results.timeEntries).toHaveLength(0)
  })

  it('rejects a search with no names', async () => {
    const res = await tenant.fetch('/api/admin/conflict-search', {
      method: 'POST',
      body: JSON.stringify({ names: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects matter creation without conflict_search_confirmed', async () => {
    const client = await createTestClient(tenant, 'Unconfirmed Test Client')
    const res = await tenant.fetch('/api/admin/matters', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id,
        case_name: 'Unconfirmed Test Matter',
        conflict_search_terms: ['Unconfirmed Test Client'],
        conflict_search_confirmed: false,
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects matter creation without any conflict_search_terms, even if confirmed is true', async () => {
    const client = await createTestClient(tenant, 'No Terms Test Client')
    const res = await tenant.fetch('/api/admin/matters', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id,
        case_name: 'No Terms Test Matter',
        conflict_search_terms: [],
        conflict_search_confirmed: true,
      }),
    })
    expect(res.status).toBe(400)
  })

  it('creates a matter and records a conflict_checks audit row when properly confirmed', async () => {
    const client = await createTestClient(tenant, 'Confirmed Test Client')
    const res = await tenant.fetch('/api/admin/matters', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id,
        case_name: 'Confirmed Test Matter',
        conflict_search_terms: ['Confirmed Test Client'],
        conflict_search_confirmed: true,
        conflict_search_results: { terms: ['Confirmed Test Client'], clients: [], matters: [], timeEntries: [] },
      }),
    })
    expect(res.status).toBe(200)
    const { matter } = await res.json()

    const { data: checks } = await supabaseAdmin
      .from('conflict_checks')
      .select('*')
      .eq('matter_id', matter.id)
    expect(checks).toHaveLength(1)
    expect(checks![0].confirmed_no_conflict).toBe(true)
    expect(checks![0].search_terms).toEqual(['Confirmed Test Client'])
  })
})
