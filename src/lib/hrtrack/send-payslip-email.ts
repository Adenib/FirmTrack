import { createClient } from '@supabase/supabase-js'
import { generatePayslipPdf, type PayrollLineItemRow } from './payslip-pdf'
import { netPayUsd } from './payroll'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class EmailSendError extends Error {}

export type SendTransport = (args: {
  apiKey: string
  fromEmail: string
  fromName: string
  to: string
  subject: string
  html: string
  attachment: { filename: string; content: string }
}) => Promise<void>

// Mirrors src/lib/billtrack/send-email.ts's resendTransport, isolated
// behind the same SendTransport type so tests can stub it without a
// network call or a real headless-Chromium PDF render.
const resendTransport: SendTransport = async ({ apiKey, fromEmail, fromName, to, subject, html, attachment }) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html, attachments: [attachment] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new EmailSendError(`Resend API error (${res.status}): ${body}`)
  }
}

// No tenant-level override table for payroll (unlike BillTrack's
// billtrack_settings) -- the firm's transactional sending address is a
// firm-wide identity, not a payroll-specific one, so this reuses the
// same env vars BillTrack already requires rather than asking the user
// to configure a second sender.
function resolveSenderConfig() {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.PAYROLL_FROM_NAME || 'FirmTrack Payroll'
  if (!apiKey || !fromEmail) {
    throw new EmailSendError('No email sending is configured — set RESEND_API_KEY and BILLTRACK_FROM_EMAIL')
  }
  return { apiKey, fromEmail, fromName }
}

// Emails a payslip PDF to the employee it belongs to and marks
// payroll_line_items.sent_at on success. Unlike invoice reminders,
// payslip sends are one-shot (no retry/reminder semantics), so success
// is recorded on the line item itself rather than a separate audit table.
export async function sendPayslipEmail(
  tenantId: string,
  lineItemId: string,
  transport: SendTransport = resendTransport
): Promise<void> {
  const { data: lineItem } = await supabaseAdmin
    .from('payroll_line_items')
    .select('*')
    .eq('id', lineItemId)
    .eq('tenant_id', tenantId)
    .single()
  if (!lineItem) throw new EmailSendError('Payroll line item not found')

  const { data: userRow } = await supabaseAdmin.from('users').select('email').eq('id', lineItem.user_id).single()
  if (!userRow?.email) throw new EmailSendError('Employee has no email address on file')

  const { data: run } = await supabaseAdmin
    .from('payroll_runs')
    .select('period_start, period_end')
    .eq('id', lineItem.payroll_run_id)
    .single()

  const net = netPayUsd(lineItem as PayrollLineItemRow)
  const netFormatted = '₦' + net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const subject = `Payslip: ${run?.period_start || ''} to ${run?.period_end || ''}`
  const html = `<p>Your payslip for the period <strong>${run?.period_start || ''}</strong> to <strong>${run?.period_end || ''}</strong> is attached.</p>
<p>Net pay: <strong>${netFormatted}</strong></p>`

  const { apiKey, fromEmail, fromName } = resolveSenderConfig()
  const pdfBuffer = await generatePayslipPdf(tenantId, lineItem as PayrollLineItemRow)
  await transport({
    apiKey,
    fromEmail,
    fromName,
    to: userRow.email,
    subject,
    html,
    attachment: { filename: `payslip-${lineItem.payroll_run_id}.pdf`, content: pdfBuffer.toString('base64') },
  })

  await supabaseAdmin.from('payroll_line_items').update({ sent_at: new Date().toISOString() }).eq('id', lineItemId)
}
