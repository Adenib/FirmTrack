// Generic workflow-stage notification email. Unlike BillTrack's
// sendInvoiceEmail (where sending IS the action, so it throws on
// failure), notifying is a side effect of advancing a stage -- missing
// config, a missing recipient email, or a transport failure must never
// block or roll back the stage advance itself. Every failure is caught
// and returned instead of thrown.

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

export async function sendWorkflowNotification(
  args: { to: string; subject: string; html: string },
  transport: SendTransport = resendTransport
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.WORKFLOWS_FROM_EMAIL
  const fromName = process.env.WORKFLOWS_FROM_NAME || 'FirmTrack'

  if (!apiKey || !fromEmail) {
    return { sent: false, error: 'Email sending is not configured (RESEND_API_KEY / WORKFLOWS_FROM_EMAIL)' }
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
