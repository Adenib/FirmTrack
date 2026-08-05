import { createClient } from '@supabase/supabase-js'
import { generateInvoicePdf, type InvoiceRow } from './invoice-pdf'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class EmailSendError extends Error {}

type InvoiceForEmail = {
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
  matters: { case_name: string } | { case_name: string }[] | null
}

export type SendTransport = (args: {
  apiKey: string
  fromEmail: string
  fromName: string
  to: string
  subject: string
  html: string
  attachment: { filename: string; content: string }
}) => Promise<void>

// Real Resend call, isolated behind the SendTransport type so tests can
// inject a stub and assert on recipient/subject/content without a network
// call, a live API key, or (since attachment generation renders a PDF via
// headless Chromium) an actual browser launch.
const resendTransport: SendTransport = async ({ apiKey, fromEmail, fromName, to, subject, html, attachment }) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
      attachments: [attachment],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new EmailSendError(`Resend API error (${res.status}): ${body}`)
  }
}

function caseName(inv: InvoiceForEmail): string {
  const m = Array.isArray(inv.matters) ? inv.matters[0] : inv.matters
  return m?.case_name || 'your matter'
}

function buildSubjectAndBody(inv: InvoiceForEmail, kind: 'initial' | 'reminder'): { subject: string; html: string } {
  const amount = '₦' + Number(inv.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const due = inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'on receipt'

  if (kind === 'initial') {
    return {
      subject: `Invoice ${inv.invoice_number} — ${amount} due`,
      html: `<p>Please find your invoice <strong>${inv.invoice_number}</strong> for <strong>${caseName(inv)}</strong>.</p>
<p>Amount due: <strong>${amount}</strong><br/>Due date: ${due}</p>
<p>Thank you for your business.</p>`,
    }
  }
  return {
    subject: `Reminder: Invoice ${inv.invoice_number} — ${amount} still due`,
    html: `<p>This is a friendly reminder that invoice <strong>${inv.invoice_number}</strong> for <strong>${caseName(inv)}</strong> remains unpaid.</p>
<p>Amount due: <strong>${amount}</strong><br/>Due date: ${due}</p>
<p>If you've already sent payment, please disregard this notice.</p>`,
  }
}

// Resolves the tenant's custom Resend key/from-address from billtrack_settings
// if one is configured, otherwise falls back to the shared FirmTrack-wide
// env-var default. Throws clearly if neither is configured — no silent no-op.
async function resolveSenderConfig(tenantId: string) {
  const { data: settings } = await supabaseAdmin
    .from('billtrack_settings')
    .select('custom_resend_api_key, custom_from_email, custom_from_name')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const apiKey = settings?.custom_resend_api_key || process.env.RESEND_API_KEY
  const fromEmail = settings?.custom_from_email || process.env.BILLTRACK_FROM_EMAIL
  const fromName = settings?.custom_from_name || process.env.BILLTRACK_FROM_NAME || 'FirmTrack Billing'

  if (!apiKey || !fromEmail) {
    throw new EmailSendError(
      'No email sending is configured — set RESEND_API_KEY and BILLTRACK_FROM_EMAIL, or configure a custom provider in BillTrack Settings'
    )
  }

  return { apiKey, fromEmail, fromName }
}

// Sends an invoice notification/reminder email and logs the attempt to
// invoice_reminders regardless of success or failure, so send history is
// always auditable. Recipient is the client's email via
// invoice -> matter -> client (invoices don't store client contact info
// directly). Throws EmailSendError if the client has no email on file, or
// if the transport call fails (after logging the failure).
export async function sendInvoiceEmail(
  tenantId: string,
  invoiceId: string,
  kind: 'initial' | 'reminder',
  transport: SendTransport = resendTransport
): Promise<void> {
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, fees_amount,
      disbursements_amount, total_amount, paid_amount, status,
      matter_id, matters(case_name, clients(email))
    `)
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (!invoice) throw new EmailSendError('Invoice not found')

  const matter = Array.isArray(invoice.matters) ? invoice.matters[0] : invoice.matters
  const client = matter ? (Array.isArray(matter.clients) ? matter.clients[0] : matter.clients) : null
  const recipientEmail = client?.email

  if (!recipientEmail) {
    throw new EmailSendError('Client has no email address on file for this matter')
  }

  const { subject, html } = buildSubjectAndBody(invoice as unknown as InvoiceForEmail, kind)

  try {
    const { apiKey, fromEmail, fromName } = await resolveSenderConfig(tenantId)
    const pdfBuffer = await generateInvoicePdf(tenantId, invoice as unknown as InvoiceRow)
    await transport({
      apiKey,
      fromEmail,
      fromName,
      to: recipientEmail,
      subject,
      html,
      attachment: { filename: `${invoice.invoice_number}.pdf`, content: pdfBuffer.toString('base64') },
    })

    await supabaseAdmin.from('invoice_reminders').insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      kind,
      recipient_email: recipientEmail,
      status: 'sent',
    })
  } catch (err) {
    await supabaseAdmin.from('invoice_reminders').insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      kind,
      recipient_email: recipientEmail,
      status: 'failed',
      error_message: (err as Error).message,
    })
    throw err
  }
}
