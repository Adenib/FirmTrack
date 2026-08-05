import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

async function grantBilltrack(tenantId: string) {
  await supabaseAdmin.from('subscriptions').insert({
    tenant_id: tenantId,
    module: 'billtrack',
    tier: 'free',
    is_active: true,
    price_per_user: 0,
  })
}

function monthsAgoIso(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  d.setDate(15)
  return d.toISOString().split('T')[0]
}

describe('BillTrack Stage 3: reports aggregation', () => {
  let tenant: TestTenant
  let matterId: string
  const twoMonthsAgo = monthsAgoIso(2)
  const thisMonth = monthsAgoIso(0)

  beforeAll(async () => {
    tenant = await createTestTenant('BillTrackReports')
    await grantBilltrack(tenant.tenantId)
    const client = await createTestClient(tenant, 'Reports Test Client', { email: 'reports-client@example.test' })
    const matter = await createTestMatter(tenant, client.id, 'Reports Test Matter')
    matterId = matter.id

    // --- Bucket A (two months ago): one invoiced entry (sent) + one paid ---
    const oldEntryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ matter_id: matterId, hours: 2, rate: 100, amount: 200, billable: true }] }),
    })
    const { entries: oldEntries } = await oldEntryRes.json()

    const oldInvRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, time_entry_ids: [oldEntries[0].id] }),
    })
    const { invoice: oldInvoice } = await oldInvRes.json()

    // Backdate the invoice and its payment into bucket A — the create/PATCH
    // routes always stamp "today," so backdating for a two-bucket test
    // requires updating the rows directly afterward.
    await supabaseAdmin.from('invoices').update({ invoice_date: twoMonthsAgo }).eq('id', oldInvoice.id)
    await supabaseAdmin
      .from('journal_entries')
      .update({ entry_date: twoMonthsAgo })
      .eq('tenant_id', tenant.tenantId)
      .eq('source_type', 'invoice_created')
      .eq('source_id', oldInvoice.id)

    await tenant.fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      body: JSON.stringify({ id: oldInvoice.id, payment_amount: 200 }),
    })
    await supabaseAdmin
      .from('journal_entries')
      .update({ entry_date: twoMonthsAgo })
      .eq('tenant_id', tenant.tenantId)
      .eq('source_type', 'invoice_payment')
      .eq('source_id', oldInvoice.id)

    // --- Bucket B (this month): one unbilled entry + one unbilled disbursement (pending/WIP) ---
    const newEntryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ matter_id: matterId, hours: 1, rate: 100, amount: 100, billable: true }] }),
    })
    const { entries: newEntries } = await newEntryRes.json()
    await supabaseAdmin.from('time_entries').update({ entry_date: thisMonth }).eq('id', newEntries[0].id)

    const disbRes = await tenant.fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matterId, description: 'Filing fee', amount: 50 }),
    })
    const { disbursement } = await disbRes.json()
    await supabaseAdmin.from('disbursements').update({ disb_date: thisMonth }).eq('id', disbursement.id)
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('buckets sent, pending (WIP), and paid amounts into the correct monthly buckets', async () => {
    const from = monthsAgoIso(3)
    const to = monthsAgoIso(-1) // a month from now, safely covers "this month"

    const res = await tenant.fetch(`/api/billtrack/reports?from=${from}&to=${to}`)
    expect(res.status).toBe(200)
    const { buckets, summary } = await res.json()

    const bucketA = buckets.find((b: { start: string; end: string }) => twoMonthsAgo >= b.start && twoMonthsAgo <= b.end)
    const bucketB = buckets.find((b: { start: string; end: string }) => thisMonth >= b.start && thisMonth <= b.end)

    expect(bucketA).toBeTruthy()
    expect(bucketA.sentCount).toBe(1)
    expect(bucketA.sentUsd).toBe(200)
    expect(bucketA.paidUsd).toBe(200)

    expect(bucketB).toBeTruthy()
    expect(bucketB.pendingUsd).toBe(150) // 100 (time) + 50 (disbursement)
    expect(bucketB.sentCount).toBe(0)

    expect(summary.sentUsd).toBe(200)
    expect(summary.paidUsd).toBe(200)
    expect(summary.pendingUsd).toBe(150)
  })
})
