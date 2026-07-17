import { createClient } from '@supabase/supabase-js'
import { deductionsTotalUsd, netPayUsd, type Deduction } from './payroll'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function fmtUsd(n: number): string {
  return '₦' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : '—'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type PayrollLineItemRow = {
  id: string
  payroll_run_id: string
  user_id: string
  base_salary_usd: number
  leave_allowance_usd: number
  deductions: Deduction[]
}

async function buildPayslipHtml(tenantId: string, lineItem: PayrollLineItemRow): Promise<string> {
  const [orgRes, userRes, runRes] = await Promise.all([
    supabaseAdmin.from('organizations').select('name').eq('id', tenantId).single(),
    supabaseAdmin.from('users').select('email').eq('id', lineItem.user_id).single(),
    supabaseAdmin.from('payroll_runs').select('period_start, period_end, pay_date').eq('id', lineItem.payroll_run_id).single(),
  ])

  const orgName = orgRes.data?.name || 'FirmTrack'
  const employeeEmail = userRes.data?.email || 'Employee'
  const run = runRes.data

  const deductionRows = (lineItem.deductions || [])
    .map((d) => `<tr><td>${escapeHtml(d.name)}</td><td class="num">${fmtUsd(d.amount_usd)}</td></tr>`)
    .join('')

  const deductionsTotal = deductionsTotalUsd(lineItem.deductions)
  const net = netPayUsd(lineItem)

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
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; border-bottom: 1px solid #d1d5db; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; }
  .section-title { font-weight: bold; margin: 16px 0 4px; }
  .totals { width: 260px; margin-left: auto; margin-top: 16px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { font-weight: bold; border-top: 1px solid #1f2937; margin-top: 4px; padding-top: 6px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(orgName)}</h1>
      <div>Payslip</div>
    </div>
    <div class="meta">
      <div><strong>Employee:</strong> ${escapeHtml(employeeEmail)}</div>
      <div><strong>Period:</strong> ${fmtDate(run?.period_start || null)} – ${fmtDate(run?.period_end || null)}</div>
      <div><strong>Pay date:</strong> ${fmtDate(run?.pay_date || null)}</div>
    </div>
  </div>

  <div class="section-title">Earnings</div>
  <table>
    <thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
    <tbody>
      <tr><td>Base salary</td><td class="num">${fmtUsd(lineItem.base_salary_usd)}</td></tr>
      ${Number(lineItem.leave_allowance_usd) > 0 ? `<tr><td>Leave allowance</td><td class="num">${fmtUsd(lineItem.leave_allowance_usd)}</td></tr>` : ''}
    </tbody>
  </table>

  ${deductionRows ? `
  <div class="section-title">Deductions</div>
  <table>
    <thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
    <tbody>${deductionRows}</tbody>
  </table>` : ''}

  <div class="totals">
    <div><span>Gross pay</span><span>${fmtUsd(Number(lineItem.base_salary_usd) + Number(lineItem.leave_allowance_usd))}</span></div>
    <div><span>Deductions</span><span>${fmtUsd(deductionsTotal)}</span></div>
    <div class="grand"><span>Net pay</span><span>${fmtUsd(net)}</span></div>
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

// Mirrors src/lib/billtrack/invoice-pdf.ts's generateInvoicePdf: build an
// HTML string, render with a serverless-optimized headless Chromium on
// Vercel (@sparticuz/chromium + puppeteer-core) or a normal local
// Puppeteer install otherwise, return the PDF as a Buffer. Not stored --
// generated on demand for both the view route and the email attachment.
export async function generatePayslipPdf(tenantId: string, lineItem: PayrollLineItemRow): Promise<Buffer> {
  const html = await buildPayslipHtml(tenantId, lineItem)
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
