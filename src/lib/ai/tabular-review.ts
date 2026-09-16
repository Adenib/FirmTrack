import Anthropic from '@anthropic-ai/sdk'

// Mirrors document-review.ts's shape exactly (transport-injectable,
// throws clearly when unconfigured, forced tool-use for structured
// output). Extracts a value per shared field from ONE document -- the
// route calls this once per document in a batch, not once for the
// whole batch, so each call's context stays small regardless of how
// many documents are in the run.

export const MODEL = 'claude-haiku-4-5-20251001'

export type TabularField = { label: string; instructions: string }

export type TabularReviewInput = {
  documentTitle: string
  documentText: string
  fields: TabularField[]
}

export type TabularFieldValue = { label: string; value: string; notes: string }

export type TabularReviewResult = {
  values: TabularFieldValue[]
}

export type TabularReviewTransport = (input: TabularReviewInput) => Promise<TabularReviewResult>

export class AiTabularReviewError extends Error {}

// Same reasoning as document-review.ts: Claude's context window handles
// a real document fine, but a malformed extraction dumping megabytes of
// garbage text shouldn't blow past a sane request size.
const MAX_TEXT_CHARS = 400_000

const anthropicTransport: TabularReviewTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const text = input.documentText.length > MAX_TEXT_CHARS
    ? input.documentText.slice(0, MAX_TEXT_CHARS) + '\n\n[...truncated...]'
    : input.documentText

  const fieldsSection = input.fields.map((f, i) => `${i + 1}. ${f.label}: ${f.instructions}`).join('\n')

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system:
      'You extract specific data points from a legal document for a due-diligence review table. For each field ' +
      'given, extract the value using ONLY what the document actually states -- never invent or infer a value ' +
      'that is not genuinely supported by the text. If a field is not addressed in the document, set its value to ' +
      '"Not specified" rather than guessing. You must return exactly one entry per field given, in the same ' +
      'order, each carrying that field\'s exact label.',
    messages: [
      {
        role: 'user',
        content:
          `Document: "${input.documentTitle}"\n\n` +
          `--- Document text ---\n${text}\n--- End document text ---\n\n` +
          `Fields to extract:\n${fieldsSection}`,
      },
    ],
    tools: [
      {
        name: 'submit_tabular_extraction',
        description: 'Submit the extracted value for each field.',
        input_schema: {
          type: 'object',
          properties: {
            values: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: "The field's exact label, copied from the input." },
                  value: { type: 'string', description: 'The extracted value, or "Not specified" if the document does not address this field.' },
                  notes: { type: 'string', description: 'Any caveat about this value, or an empty string if none.' },
                },
                required: ['label', 'value', 'notes'],
              },
            },
          },
          required: ['values'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_tabular_extraction' },
  })

  const toolUse = res.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AiTabularReviewError('AI tabular review failed: no structured response returned')
  }
  const parsed = toolUse.input as { values: TabularFieldValue[] }
  return { values: parsed.values || [] }
}

export async function reviewTabularFields(
  input: TabularReviewInput,
  transport: TabularReviewTransport = anthropicTransport
): Promise<TabularReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiTabularReviewError('AI Tabular Review is not configured (ANTHROPIC_API_KEY is not set)')
  }
  if (input.fields.length === 0) {
    throw new AiTabularReviewError('AI Tabular Review requires at least one field')
  }
  return transport(input)
}
