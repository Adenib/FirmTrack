// Same non-throwing shape as src/lib/assettrack/notify-ticket.ts -- a
// failed/unconfigured send must never fail the cron run that triggers it.

export type SendTransport = (args: {
  apiKey: string
  fromEmail: string
  fromName: string
  to: string[]
  subject: string
  html: string
}) => Promise<void>

const resendTransport: SendTransport = async ({ apiKey, fromEmail, fromName, to, subject, html }) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }
}

export async function notifyContractExpiry(
  args: { to: string[]; subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.PROCURETRACK_FROM_EMAIL || process.env.ASSETTRACK_FROM_EMAIL || process.env.SUPPORT_FROM_EMAIL
  const fromName = process.env.PROCURETRACK_FROM_NAME || 'FirmTrack'

  if (!apiKey || !fromEmail) {
    return { sent: false, error: 'Email sending is not configured (RESEND_API_KEY / PROCURETRACK_FROM_EMAIL)' }
  }
  if (args.to.length === 0) return { sent: false, error: 'No recipients' }

  try {
    await transport({ apiKey, fromEmail, fromName, to: args.to, subject: args.subject, html: args.html })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}
