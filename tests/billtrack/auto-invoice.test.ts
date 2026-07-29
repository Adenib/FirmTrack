import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, destroyTestTenant, createTestClient, createTestMatter,
  supabaseAdmin, type TestTenant,
} from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET!

async function grantBilltrack(tenantId: string) {
  await supabaseAdmin.from('subscriptions').insert({
    tenant_id: tenantId,
    module: 'billtrack',
    tier: 'free',
    is_active: true,
    price_per_user: 0,
  })
}

function runCron() {
  return fetch(`${APP_URL}/api/cron/billtrack-daily`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

describe('BillTrack Stage 2: cron auto-invoicing + reminders', () => {
  let tenant: TestTenant
  let matterId: string
  let clientId: string

  beforeAll(async () => {
    tenant = await createTestTenant('BillTrackCron')
    await grantBilltrack(tenant.tenantId)
    const client = await createTestClient(tenant, 'Cron Test Client', { email: 'cron-client@example.test' })
    clientId = client.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('rejects a request without the correct CRON_SECRET', async () => {
    const res = await fetch(`${APP_URL}/api/cron/billtrack-daily`, {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    expect(res.status).toBe(401)
  })

  // billing_anchor_day is capped 1-28 at the DB level (no "day 30 doesn't
  // exist in Feb" edge cases -- see the migration comment), but the cron's
  // isMatterDueForAutoInvoice does an exact today.getDate() === anchor
  // match. On the 29th-31st of any month there is therefore no valid
  // anchor value that can ever equal today's real date, so "a matter due
  // today" genuinely can't be constructed on those days -- not a test
  // bug to route around (faking the test process's clock wouldn't help
  // either, since the cron runs in the separate live server process this
  // test hits over HTTP, not in this Vitest process).
  it.skipIf(new Date().getDate() > 28)('auto-generates an invoice for a matter due today with unbilled time, and posts to the GL', async () => {
    const today = new Date()
    const matter = await createTestMatter(tenant, clientId, 'Cron Auto-Invoice Matter')
    matterId = matter.id

    // Matter creation doesn't expose billing_frequency/anchor via the API
    // yet (Stage 3+ UI work) — set directly so today matches the anchor.
    await supabaseAdmin
      .from('matters')
      .update({ billing_frequency: 'monthly', billing_anchor_day: today.getDate() })
      .eq('id', matterId)

    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ matter_id: matterId, hours: 3, rate_usd: 100, amount_usd: 300, billable: true }],
      }),
    })
    expect(entryRes.status).toBe(200)

    const cronRes = await runCron()
    expect(cronRes.status).toBe(200)
    const summary = await cronRes.json()
    expect(summary.autoInvoicesCreated).toBeGreaterThanOrEqual(1)

    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .eq('matter_id', matterId)
    expect(invoices).toHaveLength(1)
    const invoice = invoices![0]
    expect(invoice.auto_generated).toBe(true)
    expect(Number(invoice.total_amount_usd)).toBe(300)

    const { data: entry } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('source_type', 'invoice_created')
      .eq('source_id', invoice.id)
      .single()
    expect(entry).toBeTruthy()

    // Same cron pass also attempts the initial notification for the
    // invoice it just created — regardless of whether the placeholder
    // Resend key makes the send itself succeed, an attempt is logged.
    const { data: reminders } = await supabaseAdmin
      .from('invoice_reminders')
      .select('kind')
      .eq('invoice_id', invoice.id)
    expect(reminders!.length).toBeGreaterThanOrEqual(1)
    expect(reminders![0].kind).toBe('initial')
  })

  // Depends on the invoice created by the (also skipIf'd) test above --
  // matterId is only ever assigned inside that test's body.
  it.skipIf(new Date().getDate() > 28)('does not re-generate an invoice for a matter with no remaining unbilled time', async () => {
    const cronRes = await runCron()
    const summary = await cronRes.json()

    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('matter_id', matterId)
    // Still exactly the one invoice from the previous test — the time
    // entry it billed is now status='billed', so nothing unbilled remains.
    expect(invoices).toHaveLength(1)
    expect(summary.autoInvoiceErrors).toEqual([])
  })

  it('skips a paused invoice in the reminder pass', async () => {
    const client = await createTestClient(tenant, 'Paused Test Client', { email: 'paused-client@example.test' })
    const matter = await createTestMatter(tenant, client.id, 'Paused Reminder Matter')

    const entryRes = await tenant.fetch('/api/timetrack/entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ matter_id: matter.id, hours: 1, rate_usd: 100, amount_usd: 100, billable: true }],
      }),
    })
    const { entries } = await entryRes.json()

    const invRes = await tenant.fetch('/api/accounttrack/invoices', {
      method: 'POST',
      body: JSON.stringify({ matter_id: matter.id, time_entry_ids: [entries[0].id] }),
    })
    const { invoice } = await invRes.json()

    await tenant.fetch('/api/billtrack/invoices/pause', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, paused: true }),
    })

    await runCron()

    const { data: reminders } = await supabaseAdmin
      .from('invoice_reminders')
      .select('id')
      .eq('invoice_id', invoice.id)
    expect(reminders).toHaveLength(0)
  })
})
