// Notifies FirmTrack support of a new Standard-channel ticket. Same
// non-throwing shape as src/lib/workflows/notify.ts -- this is a side
// effect of creating a support request, never the reason the request
// creation itself should fail. Reuses the same RESEND_API_KEY already
// configured and live for BillTrack invoice emails.

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

export async function notifySupportTicket(
  args: { subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.SUPPORT_FROM_EMAIL || process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.SUPPORT_FROM_NAME || 'FirmTrack'
  const to = process.env.SUPPORT_NOTIFY_EMAIL || 'support@firmtracks.com'

  if (!apiKey || !fromEmail) {
    return { sent: false, error: 'Email sending is not configured (RESEND_API_KEY / SUPPORT_FROM_EMAIL)' }
  }

  try {
    await transport({ apiKey, fromEmail, fromName, to, subject: args.subject, html: args.html })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// The support notify address (support@firmtracks.com by default) --
// exported so the transcript route can address its "Creator Admin" copy
// to the same place notifySupportTicket already uses, rather than a
// second hardcoded default drifting out of sync with it.
export function supportNotifyEmail(): string {
  return process.env.SUPPORT_NOTIFY_EMAIL || 'support@firmtracks.com'
}

// Generic send, used for emailing a resolved ticket's transcript to an
// explicit recipient (the subscriber, the Creator Admin inbox, or both) --
// unlike notifySupportTicket, the recipient isn't fixed.
export async function sendSupportEmail(
  args: { to: string; subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.SUPPORT_FROM_EMAIL || process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.SUPPORT_FROM_NAME || 'FirmTrack'

  if (!apiKey || !fromEmail) {
    return { sent: false, error: 'Email sending is not configured (RESEND_API_KEY / SUPPORT_FROM_EMAIL)' }
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
