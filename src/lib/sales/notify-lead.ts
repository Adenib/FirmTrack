// Notifies the sales/marketing team of a new "Chat with Sales" lead or
// follow-up message. Same non-throwing shape as src/lib/support/
// notify-ticket.ts -- a side effect of a prospect's action, never the
// reason creating the lead or sending the message should fail. Reuses
// the same RESEND_API_KEY already configured for every other
// transactional email in the app.

export type SendTransport = (args: {
  apiKey: string
  fromEmail: string
  fromName: string
  to: string
  subject: string
  html: string
}) => Promise<void>

const resendTransport: SendTransport = async ({ apiKey, fromEmail, fromName, to, subject, html }) => {
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
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }
}

export async function notifySalesLead(
  args: { subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  const to = process.env.SALES_NOTIFY_EMAIL || 'sales@firmtracks.com'
  return sendSalesEmail({ to, subject: args.subject, html: args.html }, transport)
}

// Generic send, used when the recipient isn't the fixed sales inbox --
// e.g. emailing a specific agent a lead was reassigned to.
export async function sendSalesEmail(
  args: { to: string; subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.SALES_FROM_EMAIL || process.env.SUPPORT_FROM_EMAIL || process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.SALES_FROM_NAME || 'FirmTrack'

  if (!apiKey || !fromEmail) {
    return { sent: false, error: 'Email sending is not configured (RESEND_API_KEY / SALES_FROM_EMAIL)' }
  }
  if (!args.to) {
    return { sent: false, error: 'No recipient email on file' }
  }

  try {
    await transport({ apiKey, fromEmail, fromName, to: args.to, subject: args.subject, html: args.html })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}
