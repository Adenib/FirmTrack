export class EmailSendError extends Error {}

export type SendTransport = (args: {
  apiKey: string
  fromEmail: string
  fromName: string
  to: string
  subject: string
  html: string
}) => Promise<void>

// Mirrors hrtrack/send-wfh-digest-email.ts's resendTransport exactly.
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

// Same RESEND_API_KEY/BILLTRACK_FROM_EMAIL sending identity every other
// feature in this codebase reuses -- only the display name differs.
function resolveSenderConfig() {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.BILLTRACK_FROM_EMAIL
  const fromName = process.env.AITRACK_FROM_NAME || 'FirmTrack AI'
  if (!apiKey || !fromEmail) {
    throw new EmailSendError('No email sending is configured — set RESEND_API_KEY and BILLTRACK_FROM_EMAIL')
  }
  return { apiKey, fromEmail, fromName }
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  no_action: 'No action needed',
}

export type InboxDigestEmailItem = {
  subject: string
  from: string | null
  webLink: string
  priority: 'high' | 'medium' | 'low' | 'no_action'
  summary: string
  suggestedReply: string | null
}

// Sent to the lawyer's own email about their own inbox -- unlike the WFH
// digest's owner/admin/hr broadcast, this always has exactly one
// recipient, so there's no tenant-wide recipient lookup here.
export async function sendInboxDigestEmail(
  toEmail: string,
  dateLabel: string,
  items: InboxDigestEmailItem[],
  transport: SendTransport = resendTransport
): Promise<void> {
  if (items.length === 0) return

  const { apiKey, fromEmail, fromName } = resolveSenderConfig()

  const rows = items
    .map(
      (item) => `<tr>
  <td><strong>${PRIORITY_LABEL[item.priority] || item.priority}</strong></td>
  <td><a href="${item.webLink}">${item.subject}</a><br><span style="color:#666">${item.from || '(unknown sender)'}</span></td>
  <td>${item.summary}</td>
  <td>${item.suggestedReply || '&mdash;'}</td>
</tr>`
    )
    .join('')

  const subject = `Inbox digest: ${items.length} unread message${items.length === 1 ? '' : 's'} (${dateLabel})`
  const html = `<p>Your AITrack daily inbox digest for ${dateLabel}:</p>
<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Priority</th><th>Message</th><th>Summary</th><th>Suggested reply</th></tr></thead><tbody>${rows}</tbody></table>
<p style="color:#666;font-size:12px">Suggested replies are AI-generated starting points, not sent automatically -- review before using.</p>`

  await transport({ apiKey, fromEmail, fromName, to: toEmail, subject, html })
}
