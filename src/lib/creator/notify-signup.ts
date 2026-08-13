// Notifies FirmTrack's own team of a new pending signup awaiting approval
// in the Creator Console. Same non-throwing shape as
// src/lib/support/notify-ticket.ts -- this is a side effect of a
// successful signup, never the reason signup itself should fail.

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

export async function notifyNewSignup(
  args: { orgName: string; email: string; orgId: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.SIGNUP_FROM_EMAIL || process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.SIGNUP_FROM_NAME || 'FirmTrack'
  const to = process.env.SIGNUP_NOTIFY_EMAIL || 'support@firmtracks.com'

  if (!apiKey || !fromEmail) {
    return { sent: false, error: 'Email sending is not configured (RESEND_API_KEY / SIGNUP_FROM_EMAIL)' }
  }

  const subject = `New signup awaiting approval: ${args.orgName}`
  const html = `<p>A new organization has signed up and needs approval.</p>
<p><strong>Firm:</strong> ${args.orgName}<br/>
<strong>Owner email:</strong> ${args.email}</p>
<p>Review it in the Creator Console under Signups.</p>`

  try {
    await transport({ apiKey, fromEmail, fromName, to, subject, html })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}
