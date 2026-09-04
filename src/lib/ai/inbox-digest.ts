import Anthropic from '@anthropic-ai/sdk'

// Mirrors document-review.ts/document-draft.ts's shape (transport-
// injectable, throws clearly when unconfigured, tool-use for structured
// output). One call covers a user's whole unread inbox at once, not one
// call per message -- cost and latency.

export const MODEL = 'claude-haiku-4-5-20251001'

export type InboxDigestMessageInput = {
  id: string
  subject: string
  from: string | null
  receivedDateTime: string
  bodyPreview: string
}

export type InboxDigestInput = {
  messages: InboxDigestMessageInput[]
}

export type InboxDigestPriority = 'high' | 'medium' | 'low' | 'no_action'

export type InboxDigestEntry = {
  id: string
  priority: InboxDigestPriority
  summary: string
  suggestedReply: string | null
}

export type InboxDigestResult = {
  entries: InboxDigestEntry[]
}

export type InboxDigestTransport = (input: InboxDigestInput) => Promise<InboxDigestResult>

export class AiInboxDigestError extends Error {}

const anthropicTransport: InboxDigestTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messagesBlock = input.messages
    .map(
      (m, i) =>
        `[${i}] id: ${m.id}\nFrom: ${m.from || '(unknown)'}\nReceived: ${m.receivedDateTime}\nSubject: ${m.subject}\nPreview: ${m.bodyPreview}`
    )
    .join('\n\n')

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You triage a lawyer\'s unread inbox. For every message given, decide a priority (high/medium/low/no_action), ' +
      'write a one-line summary of what it is and why it matters, and -- only when a reply is clearly warranted -- ' +
      'a brief suggested reply the lawyer could send as-is or edit. Use "no_action" and a null suggestedReply for ' +
      'newsletters, automated notifications, or anything that plainly needs no response. Never fabricate facts, ' +
      'names, or commitments beyond what the message itself contains -- a suggested reply should only restate or ' +
      'acknowledge what is actually in the message. You must return exactly one entry per message given, in the ' +
      'same order, each carrying that message\'s exact id.',
    messages: [{ role: 'user', content: `Unread messages:\n\n${messagesBlock}` }],
    tools: [
      {
        name: 'submit_inbox_digest',
        description: 'Submit the triage results, one entry per message.',
        input_schema: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: "The message's exact id, copied from the input." },
                  priority: { type: 'string', enum: ['high', 'medium', 'low', 'no_action'] },
                  summary: { type: 'string', description: 'A one-line summary of the message.' },
                  suggestedReply: {
                    type: ['string', 'null'],
                    description: 'A brief suggested reply, or null if none is warranted.',
                  },
                },
                required: ['id', 'priority', 'summary', 'suggestedReply'],
              },
            },
          },
          required: ['entries'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_inbox_digest' },
  })

  const toolUse = res.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AiInboxDigestError('AI inbox digest failed: no structured response returned')
  }
  const parsed = toolUse.input as { entries: InboxDigestEntry[] }
  return { entries: parsed.entries }
}

export async function summarizeInboxDigest(
  input: InboxDigestInput,
  transport: InboxDigestTransport = anthropicTransport
): Promise<InboxDigestResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiInboxDigestError('AI Inbox Digest is not configured (ANTHROPIC_API_KEY is not set)')
  }
  return transport(input)
}
