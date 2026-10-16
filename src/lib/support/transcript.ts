// Pure HTML builder for a resolved ticket's email transcript -- shared by
// the transcript API route, kept separate so it's unit-testable without
// touching the database or Resend.

export type TranscriptMessage = {
  sender_type: 'user' | 'ai' | 'agent'
  body: string
  created_at: string
}

export type TranscriptRequest = {
  id: string
  subject: string
  description: string
  severity: string
  channel: string
}

const SENDER_LABEL: Record<TranscriptMessage['sender_type'], string> = {
  user: 'Subscriber',
  agent: 'FirmTrack Support',
  ai: 'AI Assistant',
}

export function buildTranscriptEmail(request: TranscriptRequest, messages: TranscriptMessage[]) {
  const reference = `SR-${request.id.slice(0, 8).toUpperCase()}`
  const subject = `Support transcript ${reference}: ${request.subject}`

  const rows = [
    `<p><strong>Subscriber:</strong> ${request.description}</p>`,
    ...messages.map(
      (m) =>
        `<p><strong>${SENDER_LABEL[m.sender_type]}</strong> (${new Date(m.created_at).toLocaleString()}):<br/>${m.body}</p>`
    ),
  ].join('\n')

  const html = `
    <p>Transcript for support request <strong>${reference}</strong> -- ${request.subject}</p>
    <p>Severity ${request.severity} &middot; ${request.channel === 'ai_assisted' ? 'AI Assistant' : 'Standard'} channel</p>
    <hr/>
    ${rows}
  `

  return { reference, subject, html }
}
