import Anthropic from '@anthropic-ai/sdk'

// Mirrors src/lib/ai/time-entry-draft.ts's shape (transport-injectable,
// throws clearly when unconfigured). Gated by a real paid subscription
// (hasActiveModule(tenantId, 'ai_support')) rather than a free/disable
// toggle, since there's no free-but-admin-can-turn-off case here --
// the subscription itself is the on/off switch.

export type SupportChatMessage = { role: 'user' | 'assistant'; content: string }

export type SupportChatInput = {
  subject: string
  description: string
  history: SupportChatMessage[] // prior turns in this thread, oldest first
}

export type SendTransport = (input: SupportChatInput) => Promise<string>

export class AiSupportError extends Error {}

const SYSTEM_PROMPT =
  'You are the FirmTrack support assistant. FirmTrack is a legal practice management SaaS ' +
  'with modules: TimeTrack (time entry/billing), BillTrack (invoicing), AccountTrack (trust ' +
  'accounting/general ledger), DocTrack (document management), HRTrack (attendance/payroll/' +
  'performance), CalenTrack (calendar/deadlines), and admin tools (users, clients, matters, ' +
  'conflict checks, workflow automation for practice areas). ' +
  'Help the user with their support request as best you can. Be concise and practical. ' +
  "If the issue needs a human (billing disputes, data issues, bugs you can't resolve by " +
  'explaining), say so plainly and let them know a human agent will follow up.'

// The Anthropic API requires strict user/assistant alternation. The
// framing turn below is always 'user', so if the thread's first real
// turn is also 'user' (the normal case -- a user opens the request and
// sends the first message), two consecutive 'user' turns would result.
// Coalescing consecutive same-role turns keeps this safe regardless of
// how the history is shaped (including an 'agent' human reply, which
// history.map already folds into 'assistant').
function coalesceTurns(turns: SupportChatMessage[]): SupportChatMessage[] {
  const merged: SupportChatMessage[] = []
  for (const turn of turns) {
    const last = merged[merged.length - 1]
    if (last && last.role === turn.role) {
      last.content += '\n\n' + turn.content
    } else {
      merged.push({ ...turn })
    }
  }
  return merged
}

const anthropicTransport: SendTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messages = coalesceTurns([
    { role: 'user', content: `Support request subject: ${input.subject}\nDescription: ${input.description}` },
    ...input.history,
  ])

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages,
  })

  const textBlock = res.content.find((c) => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new AiSupportError('AI support chat failed: no text response returned')
  }
  return textBlock.text
}

export async function sendSupportMessage(
  input: SupportChatInput,
  transport: SendTransport = anthropicTransport
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiSupportError('AI Support Assistant is not configured (ANTHROPIC_API_KEY is not set)')
  }
  return transport(input)
}
