import Anthropic from '@anthropic-ai/sdk'

// First AI/LLM integration in this codebase. Deliberately scoped: the
// model only drafts the narrative text and suggests a task code --
// hours are always computed deterministically from the calendar
// event's duration in the calling route, never by the model, since
// billing arithmetic shouldn't depend on an LLM. The lawyer reviews
// and can edit everything before it's ever saved as a real time entry
// via the existing POST /api/timetrack/entries route.

export type DraftTimeEntryInput = {
  eventTitle: string
  eventDescription: string | null
  matterCaseName: string
  durationHours: number
  taskCodes: { code: string; description: string | null }[]
}

export type DraftTimeEntryResult = {
  narrative: string
  suggestedTaskCode: string | null
}

export type DraftTransport = (input: DraftTimeEntryInput) => Promise<DraftTimeEntryResult>

export class AiDraftError extends Error {}

const anthropicTransport: DraftTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const taskCodeList = input.taskCodes.length
    ? input.taskCodes.map((t) => `${t.code}: ${t.description || ''}`).join('\n')
    : '(no task codes configured for this firm)'

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system:
      'You draft concise, professional legal billing narratives from a calendar event description. ' +
      'Write in the third person, past tense, the way a lawyer would describe billable work on an invoice ' +
      '(e.g. "Reviewed and revised draft settlement agreement; corresponded with client regarding same."). ' +
      'Do not invent facts not implied by the event title/description -- if the description is thin, keep the narrative general rather than fabricating specifics.',
    messages: [
      {
        role: 'user',
        content:
          `Calendar event: "${input.eventTitle}"\n` +
          `Description: ${input.eventDescription || '(none)'}\n` +
          `Matter: ${input.matterCaseName}\n` +
          `Duration: ${input.durationHours} hours\n\n` +
          `Available task codes:\n${taskCodeList}`,
      },
    ],
    tools: [
      {
        name: 'draft_time_entry',
        description: 'Submit the drafted billing narrative and suggested task code.',
        input_schema: {
          type: 'object',
          properties: {
            narrative: { type: 'string', description: 'The drafted billing narrative.' },
            suggested_task_code: {
              type: 'string',
              description: 'The single best-matching task code from the list. Omit this field entirely if none fit well.',
            },
          },
          required: ['narrative'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'draft_time_entry' },
  })

  const toolUse = res.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AiDraftError('AI drafting failed: no structured response returned')
  }
  const parsed = toolUse.input as { narrative: string; suggested_task_code?: string }
  return { narrative: parsed.narrative, suggestedTaskCode: parsed.suggested_task_code || null }
}

export async function draftTimeEntry(
  input: DraftTimeEntryInput,
  transport: DraftTransport = anthropicTransport
): Promise<DraftTimeEntryResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiDraftError('AI drafting is not configured (ANTHROPIC_API_KEY is not set)')
  }
  return transport(input)
}
