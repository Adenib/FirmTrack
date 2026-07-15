import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter, createTestUser,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'
import { sendInvoiceEmail } from '@/lib/billtrack/send-email'

async function grantBilltrack(tenantId: string) {
  await supabaseAdmin.from('subscriptions').insert({
    tenant_id: tenantId,
    module: 'billtrack',
    tier: 'free',
    is_active: true,
    price_per_user: 0,
  })
}

async function createUnpaidInvoice(tenant: TestTenant, matterId: string) {
  const entryRes = await tenant.fetch('/api/timetrack/entries', {
    method: 'POST',
    body: JSON.stringify({
      entries: [{ matter_id: matterId, hours: 2, rate_usd: 100, amount_usd: 200, billable: true }],
    }),
  })
  const { entries } = await entryRes.json()

  const invRes = await tenant.fetch('/api/accounttrack/invoices', {
    method: 'POST',
    body: JSON.stringify({ matter_id: matterId, time_entry_ids: [entries[0].id] }),
  })
  const { invoice } = await invRes.json()
  return invoice
}

describe('BillTrack Stage 1: send + pause', () => {
  let tenant: TestTenant
  let staffUser: TestTenant
  let matterId: string
  let responsibleLawyerUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('BillTrack')
    await grantBilltrack(tenant.tenantId)
    staffUser = await createTestUser(tenant, { role: 'staff' })
    responsibleLawyerUser = await createTestUser(tenant, { role: 'staff' })

    const client = await createTestClient(tenant, 'BillTrack Test Client', { email: 'client@example.test' })
    const matter = await createTestMatter(tenant, client.id, 'BillTrack Test Matter', {
      responsible_lawyer: responsibleLawyerUser.userId,
    })
    matterId = matter.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [staffUser.userId, responsibleLawyerUser.userId])
  })

  it('sendInvoiceEmail logs a row with the correct recipient/kind via a stubbed transport', async () => {
    const invoice = await createUnpaidInvoice(tenant, matterId)

    const calls: Array<{ to: string; subject: string }> = []
    await sendInvoiceEmail(tenant.tenantId, invoice.id, 'initial', async (args) => {
      calls.push({ to: args.to, subject: args.subject })
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].to).toBe('client@example.test')
    expect(calls[0].subject).toContain(invoice.invoice_number)

    const { data: log } = await supabaseAdmin
      .from('invoice_reminders')
      .select('kind, status, recipient_email')
      .eq('invoice_id', invoice.id)
      .single()
    expect(log?.kind).toBe('initial')
    expect(log?.status).toBe('sent')
    expect(log?.recipient_email).toBe('client@example.test')
  })

  it('a staff user (not owner/admin/accounts, not the responsible lawyer) is blocked from pausing', async () => {
    const invoice = await createUnpaidInvoice(tenant, matterId)

    const res = await staffUser.fetch('/api/billtrack/invoices/pause', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, paused: true }),
    })
    expect(res.status).toBe(403)
  })

  it('the matter\'s responsible lawyer can pause even though their role is "staff"', async () => {
    const invoice = await createUnpaidInvoice(tenant, matterId)

    const res = await responsibleLawyerUser.fetch('/api/billtrack/invoices/pause', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, paused: true }),
    })
    expect(res.status).toBe(200)
    const { invoice: updated } = await res.json()
    expect(updated.reminders_paused).toBe(true)
    expect(updated.reminders_paused_by).toBe(responsibleLawyerUser.userId)
  })

  it('owner can resume (unpause) an invoice', async () => {
    const invoice = await createUnpaidInvoice(tenant, matterId)

    await tenant.fetch('/api/billtrack/invoices/pause', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, paused: true }),
    })

    const res = await tenant.fetch('/api/billtrack/invoices/pause', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, paused: false }),
    })
    expect(res.status).toBe(200)
    const { invoice: updated } = await res.json()
    expect(updated.reminders_paused).toBe(false)
    expect(updated.reminders_paused_by).toBeNull()
  })

  it('GET /api/billtrack/invoices lists invoices with matter/client and last-sent info', async () => {
    const invoice = await createUnpaidInvoice(tenant, matterId)
    await sendInvoiceEmail(tenant.tenantId, invoice.id, 'initial', async () => {})

    const res = await tenant.fetch(`/api/billtrack/invoices?matter_id=${matterId}`)
    expect(res.status).toBe(200)
    const { invoices } = await res.json()
    const found = invoices.find((i: { id: string }) => i.id === invoice.id)
    expect(found).toBeTruthy()
    expect(found.last_reminder?.kind).toBe('initial')
  })
})
