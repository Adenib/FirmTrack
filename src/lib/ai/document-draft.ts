import Anthropic from '@anthropic-ai/sdk'

// Mirrors document-review.ts/time-entry-draft.ts's shape (transport-
// injectable, throws clearly when unconfigured, tool-use for structured
// output). The output here can become a real work product (saved into
// DocTrack), so the "don't fabricate specifics" discipline already used
// in the other two AI features is stated even more explicitly, plus an
// attorney-review framing neither of the others needed.

export const MODEL = 'claude-haiku-4-5-20251001'

export type DocumentDraftInput = {
  documentType: string
  matterCaseName: string | null
  prompt: string
}

export type DocumentDraftResult = {
  content: string
  notes: string
}

export type DraftTransport = (input: DocumentDraftInput) => Promise<DocumentDraftResult>

export class AiDocumentDraftError extends Error {}

const anthropicTransport: DraftTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You draft professional legal documents from a description. Write complete, well-structured documents ' +
      `(${input.documentType}) using standard legal drafting conventions. ` +
      "Never fabricate matter-specific facts, names, dates, or figures beyond what's provided in the prompt or " +
      'matter context -- use clearly-marked placeholders (e.g. "[AMOUNT]", "[DATE]") for anything not supplied. ' +
      'This draft is a starting point for attorney review, never a finished, filed, or advice-equivalent document -- ' +
      'flag anything the drafting attorney should specifically confirm (jurisdiction-specific requirements, ' +
      'missing facts, unusual terms) in your notes, not buried in the document body itself.',
    messages: [
      {
        role: 'user',
        content:
          `Document type: ${input.documentType}\n` +
          (input.matterCaseName ? `Matter: ${input.matterCaseName}\n` : '') +
          `\nInstructions: ${input.prompt}`,
      },
    ],
    tools: [
      {
        name: 'submit_document_draft',
        description: 'Submit the drafted document and any notes for the reviewing attorney.',
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The full drafted document text.' },
            notes: { type: 'string', description: 'Caveats, placeholders used, or things the attorney should confirm before use.' },
          },
          required: ['content', 'notes'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_document_draft' },
  })

  const toolUse = res.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AiDocumentDraftError('AI document drafting failed: no structured response returned')
  }
  const parsed = toolUse.input as { content: string; notes: string }
  return { content: parsed.content, notes: parsed.notes }
}

export async function draftDocument(
  input: DocumentDraftInput,
  transport: DraftTransport = anthropicTransport
): Promise<DocumentDraftResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiDocumentDraftError('AI Document Drafting is not configured (ANTHROPIC_API_KEY is not set)')
  }
  return transport(input)
}
