import { createClient } from '@supabase/supabase-js'

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
}) => Promise<void>

// Mirrors send-payslip-email.ts's resendTransport, minus the PDF
// attachment -- this digest is a plain summary list, nothing to attach.
const resendTransport: SendTransport = async ({ apiKey, fromEmail, fromName, to, subject, html }) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new EmailSendError(`Resend API error (${res.status}): ${body}`)
  }
}

// Same env vars as the rest of HRTrack's email sending (send-payslip-email.ts) --
// a firm-wide sending identity, not a per-feature one.
function resolveSenderConfig() {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.HRTRACK_FROM_NAME || 'FirmTrack HR'
  if (!apiKey || !fromEmail) {
    throw new EmailSendError('No email sending is configured — set RESEND_API_KEY and BILLTRACK_FROM_EMAIL')
  }
  return { apiKey, fromEmail, fromName }
}

export type WfhDigestEntry = { email: string; unconfirmedCount: number }

// Sends the end-of-day "probably not working from home" digest to every
// owner/admin/hr user for a tenant. Called once per tenant by the
// hrtrack-wfh-digest cron -- never called when entries is empty (the cron
// itself skips tenants with nothing to report).
export async function sendWfhDigestEmail(
  tenantId: string,
  dateLabel: string,
  entries: WfhDigestEntry[],
  transport: SendTransport = resendTransport
): Promise<void> {
  if (entries.length === 0) return

  const { data: recipients } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('tenant_id', tenantId)
    .in('role', ['owner', 'admin', 'hr'])

  const recipientEmails = (recipients || []).map((r) => r.email).filter(Boolean)
  if (recipientEmails.length === 0) return

  const { apiKey, fromEmail, fromName } = resolveSenderConfig()

  const rows = entries
    .map((e) => `<tr><td>${e.email}</td><td>${e.unconfirmedCount}</td></tr>`)
    .join('')
  const subject = `WFH check-in: ${entries.length} employee${entries.length === 1 ? '' : 's'} probably not working (${dateLabel})`
  const html = `<p>The following employees had at least one "still working from home?" prompt today with no response, and are probably not working:</p>
<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Employee</th><th>Unconfirmed prompts</th></tr></thead><tbody>${rows}</tbody></table>`

  for (const to of recipientEmails) {
    await transport({ apiKey, fromEmail, fromName, to, subject, html })
  }
}
