import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function fmtAmount(n: number, currency?: string | null): string {
  const formatted = Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency && currency !== 'NGN' ? `${currency} ${formatted}` : `₦${formatted}`
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : '—'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type InvoiceRow = {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  fees_amount: number
  disbursements_amount: number
  total_amount: number
  paid_amount: number
  status: string
  matter_id: string
  currency?: string | null
}

async function buildInvoiceHtml(tenantId: string, invoice: InvoiceRow): Promise<string> {
  const [orgRes, matterRes, timeEntriesRes, disbursementsRes] = await Promise.all([
    supabaseAdmin.from('organizations').select('name').eq('id', tenantId).single(),
    supabaseAdmin
      .from('matters')
      .select('case_name, matter_id, clients(name, email)')
      .eq('id', invoice.matter_id)
      .single(),
    supabaseAdmin
      .from('time_entries')
      .select('entry_date, hours, rate, amount, explanation, task_codes(description)')
      .eq('tenant_id', tenantId)
      .eq('invoice_id', invoice.id)
      .order('entry_date'),
    supabaseAdmin
      .from('disbursements')
      .select('disb_date, description, amount')
      .eq('tenant_id', tenantId)
      .eq('invoice_id', invoice.id)
      .order('disb_date'),
  ])

  const orgName = orgRes.data?.name || 'FirmTrack'
  const matter = matterRes.data
  const client = matter ? (Array.isArray(matter.clients) ? matter.clients[0] : matter.clients) : null
  const timeEntries = timeEntriesRes.data || []
  const disbursements = disbursementsRes.data || []

  const timeRows = timeEntries
    .map((e) => {
      const taskCode = Array.isArray(e.task_codes) ? e.task_codes[0] : e.task_codes
      const desc = e.explanation || taskCode?.description || 'Professional services'
      return `<tr>
        <td>${fmtDate(e.entry_date)}</td>
        <td>${escapeHtml(desc)}</td>
        <td class="num">${Number(e.hours || 0).toFixed(2)}</td>
        <td class="num">${fmtAmount(e.rate, invoice.currency)}</td>
        <td class="num">${fmtAmount(e.amount, invoice.currency)}</td>
      </tr>`
    })
    .join('')

  const disbRows = disbursements
    .map(
      (d) => `<tr>
        <td>${fmtDate(d.disb_date)}</td>
        <td colspan="3">${escapeHtml(d.description || 'Disbursement')}</td>
        <td class="num">${fmtAmount(d.amount, invoice.currency)}</td>
      </tr>`
    )
    .join('')

  const balanceDue = Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 12px; margin: 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .meta { text-align: right; }
  .meta div { margin-bottom: 2px; }
  .bill-to { margin-bottom: 24px; }
  .bill-to .label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; border-bottom: 1px solid #d1d5db; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; }
  .section-title { font-weight: bold; margin: 16px 0 4px; }
  .totals { width: 260px; margin-left: auto; margin-top: 16px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { font-weight: bold; border-top: 1px solid #1f2937; margin-top: 4px; padding-top: 6px; }
  .totals .due { font-weight: bold; color: #b91c1c; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(orgName)}</h1>
      <div>Invoice</div>
    </div>
    <div class="meta">
      <div><strong>Invoice #:</strong> ${escapeHtml(invoice.invoice_number)}</div>
      <div><strong>Date:</strong> ${fmtDate(invoice.invoice_date)}</div>
      <div><strong>Due:</strong> ${fmtDate(invoice.due_date)}</div>
      <div><strong>Status:</strong> ${escapeHtml(invoice.status.replace('_', ' '))}</div>
    </div>
  </div>

  <div class="bill-to">
    <div class="label">Bill To</div>
    <div>${escapeHtml(client?.name || 'Client')}</div>
    <div class="label" style="margin-top: 8px;">Matter</div>
    <div>${escapeHtml(matter?.case_name || 'Matter')} (${escapeHtml(matter?.matter_id || '')})</div>
  </div>

  ${timeRows ? `
  <div class="section-title">Fees</div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${timeRows}</tbody>
  </table>` : ''}

  ${disbRows ? `
  <div class="section-title">Disbursements</div>
  <table>
    <thead><tr><th>Date</th><th colspan="3">Description</th><th class="num">Amount</th></tr></thead>
    <tbody>${disbRows}</tbody>
  </table>` : ''}

  <div class="totals">
    <div><span>Fees</span><span>${fmtAmount(invoice.fees_amount, invoice.currency)}</span></div>
    <div><span>Disbursements</span><span>${fmtAmount(invoice.disbursements_amount, invoice.currency)}</span></div>
    <div class="grand"><span>Total</span><span>${fmtAmount(invoice.total_amount, invoice.currency)}</span></div>
    <div><span>Paid</span><span>${fmtAmount(invoice.paid_amount, invoice.currency)}</span></div>
    <div class="due"><span>Balance Due</span><span>${fmtAmount(balanceDue, invoice.currency)}</span></div>
  </div>
</body>
</html>`
}

async function launchBrowser() {
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteerCore = (await import('puppeteer-core')).default
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }
  const puppeteer = (await import('puppeteer')).default
  return puppeteer.launch({ headless: true })
}

// Renders a detailed, itemized PDF invoice (fees + disbursements line
// items, totals, balance due) for attaching to the notification email.
// Uses a serverless-optimized headless Chromium (@sparticuz/chromium +
// puppeteer-core) in production/Vercel, and a normal full Puppeteer install
// locally — @sparticuz/chromium's binary targets the Lambda/Vercel Linux
// runtime specifically and does not run on a local Windows/macOS dev machine.
export async function generateInvoicePdf(tenantId: string, invoice: InvoiceRow): Promise<Buffer> {
  const html = await buildInvoiceHtml(tenantId, invoice)
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
