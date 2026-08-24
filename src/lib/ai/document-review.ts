import Anthropic from '@anthropic-ai/sdk'

// Mirrors time-entry-draft.ts/support-chat.ts's shape (transport-injectable,
// throws clearly when unconfigured). Uses tool-use for structured output,
// same pattern as time-entry-draft.ts, since free-text parsing of a
// review would be unreliable.

export const MODEL = 'claude-haiku-4-5-20251001'

export type PlaybookRule = { label: string; instructions: string }

export type DocumentReviewInput = {
  documentTitle: string
  matterCaseName: string
  documentText: string
  playbookRules?: PlaybookRule[]
}

export type KeyTerm = { label: string; value: string }
export type KeyDate = { label: string; date: string }
export type RiskFlag = { severity: 'low' | 'medium' | 'high'; description: string }
export type PlaybookResult = { rule_label: string; status: 'pass' | 'fail' | 'unclear'; notes: string }

export type DocumentReviewResult = {
  summary: string
  keyTerms: KeyTerm[]
  keyDates: KeyDate[]
  riskFlags: RiskFlag[]
  playbookResults: PlaybookResult[] | null
}

export type ReviewTransport = (input: DocumentReviewInput) => Promise<DocumentReviewResult>

export class AiDocumentReviewError extends Error {}

// Real documents can run long; Claude's context window handles this fine,
// but an extremely large extraction (e.g. a malformed PDF dumping
// megabytes of garbage text) shouldn't blow past a sane request size.
const MAX_TEXT_CHARS = 400_000

const anthropicTransport: ReviewTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const text = input.documentText.length > MAX_TEXT_CHARS
    ? input.documentText.slice(0, MAX_TEXT_CHARS) + '\n\n[...truncated...]'
    : input.documentText

  const playbookSection = input.playbookRules?.length
    ? `\n\nApply this playbook -- evaluate the document against EACH rule below and include one entry per rule in playbook_results:\n` +
      input.playbookRules.map((r, i) => `${i + 1}. ${r.label}: ${r.instructions}`).join('\n')
    : ''

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You are a legal document review assistant. Analyze the provided document text and extract a concise ' +
      'summary, key terms, key dates, and risk flags. Be precise and grounded in the actual document text -- ' +
      "never invent terms, dates, or clauses that aren't there. If something is genuinely absent or unclear, say so " +
      "rather than guessing.",
    messages: [
      {
        role: 'user',
        content:
          `Document: "${input.documentTitle}"\n` +
          `Matter: ${input.matterCaseName}\n\n` +
          `--- Document text ---\n${text}\n--- End document text ---` +
          playbookSection,
      },
    ],
    tools: [
      {
        name: 'submit_document_review',
        description: 'Submit the structured document review.',
        input_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'A concise summary of the document.' },
            key_terms: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, value: { type: 'string' } },
                required: ['label', 'value'],
              },
            },
            key_dates: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, date: { type: 'string' } },
                required: ['label', 'date'],
              },
            },
            risk_flags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  description: { type: 'string' },
                },
                required: ['severity', 'description'],
              },
            },
            playbook_results: {
              type: 'array',
              description: 'Omit entirely if no playbook was supplied. One entry per playbook rule otherwise.',
              items: {
                type: 'object',
                properties: {
                  rule_label: { type: 'string' },
                  status: { type: 'string', enum: ['pass', 'fail', 'unclear'] },
                  notes: { type: 'string' },
                },
                required: ['rule_label', 'status', 'notes'],
              },
            },
          },
          required: ['summary', 'key_terms', 'key_dates', 'risk_flags'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_document_review' },
  })

  const toolUse = res.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AiDocumentReviewError('AI document review failed: no structured response returned')
  }
  const parsed = toolUse.input as {
    summary: string
    key_terms: KeyTerm[]
    key_dates: KeyDate[]
    risk_flags: RiskFlag[]
    playbook_results?: PlaybookResult[]
  }

  return {
    summary: parsed.summary,
    keyTerms: parsed.key_terms || [],
    keyDates: parsed.key_dates || [],
    riskFlags: parsed.risk_flags || [],
    playbookResults: input.playbookRules?.length ? (parsed.playbook_results || []) : null,
  }
}

export async function reviewDocument(
  input: DocumentReviewInput,
  transport: ReviewTransport = anthropicTransport
): Promise<DocumentReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiDocumentReviewError('AI Document Review is not configured (ANTHROPIC_API_KEY is not set)')
  }
  return transport(input)
}
