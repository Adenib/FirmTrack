// Notifies IT that a laptop repair ticket was submitted. Same non-throwing
// shape as src/lib/workflows/notify.ts -- this is a side effect of
// creating a ticket, never the reason ticket creation itself should fail.
// Recipient is per-tenant (assettrack_sync_settings.notification_email,
// e.g. AELEX's it@aelex.com), not a fixed address, since AssetTrack is
// sold to more than one tenant.

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

async function sendAssetTrackEmail(
  args: { to: string; subject: string; html: string },
  transport: SendTransport,
  missingRecipientError: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.ASSETTRACK_FROM_EMAIL || process.env.SUPPORT_FROM_EMAIL || process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.ASSETTRACK_FROM_NAME || 'FirmTrack'

  if (!apiKey || !fromEmail) {
    return { sent: false, error: 'Email sending is not configured (RESEND_API_KEY / ASSETTRACK_FROM_EMAIL)' }
  }
  if (!args.to) {
    return { sent: false, error: missingRecipientError }
  }

  try {
    await transport({ apiKey, fromEmail, fromName, to: args.to, subject: args.subject, html: args.html })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// IT's "a ticket was submitted" notification -- recipient is the
// per-tenant assettrack_sync_settings.notification_email.
export async function notifyAssetTicketSubmitted(
  args: { to: string; subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  return sendAssetTrackEmail(args, transport, 'No IT notification email configured for this tenant (see AssetTrack Settings)')
}

// The reporting employee's own status-update notification -- recipient is
// the ticket's notify_email override, falling back to their FirmTrack
// account email.
export async function notifyAssetTicketReporter(
  args: { to: string; subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  return sendAssetTrackEmail(args, transport, 'No reporter email on file')
}
