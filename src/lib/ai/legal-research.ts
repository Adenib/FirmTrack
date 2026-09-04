import Anthropic from '@anthropic-ai/sdk'

// The first agentic (multi-step tool use) AI feature in this codebase --
// every other feature (document-draft.ts, document-review.ts, ...) is a
// single forced-tool-call request. Legal research needs real grounding
// (courts have sanctioned lawyers over AI-fabricated citations), so this
// combines Claude's server-side web_search tool with a client-side
// structured-output tool. Web search is server-executed -- Anthropic
// runs it and injects results into the same assistant turn, so no
// client-side loop is needed for the search itself. tool_choice is left
// as the default "auto" (forcing a tool would block the model from ever
// searching first); if the model answers without calling the submit
// tool, one bounded follow-up call forces it.

export const MODEL = 'claude-haiku-4-5-20251001'
const MAX_SEARCH_USES = 5

export type LegalResearchInput = {
  question: string
  matterCaseName: string | null
}

export type ResearchSource = { title: string; url: string }

export type LegalResearchResult = {
  content: string
  sources: ResearchSource[]
  notes: string
}

export type ResearchTransport = (input: LegalResearchInput) => Promise<LegalResearchResult>

export class AiLegalResearchError extends Error {}

const SYSTEM_PROMPT =
  'You are a legal research assistant producing an internal research memo for a lawyer\'s own review. ' +
  'You have access to a web search tool -- use it to ground your answer in real, current sources. ' +
  'Never state a case name, citation, or statute section that a search result did not actually return -- ' +
  'where search does not surface something specific, describe the applicable legal principle generally instead ' +
  'of inventing a citation. Structure the memo content as: Question Presented, Short Answer, Analysis, Caveats. ' +
  'This is a research starting point for attorney review, never a substitute for verified legal research or ' +
  'filed work product -- use the notes field to flag anything that specifically needs independent verification, ' +
  'especially any citation you included. The full list of sources is tracked separately from what you write, so ' +
  'the memo content must be clean prose -- never include inline citation markup like <cite> tags, footnote ' +
  'markers, or reference brackets in the content field. Once your research is complete, call ' +
  'submit_research_memo with your final answer -- do not leave your findings only as plain text.'

const SUBMIT_TOOL: Anthropic.Tool = {
  name: 'submit_research_memo',
  description: 'Submit the final research memo for the reviewing attorney.',
  input_schema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The full memo text (Question Presented, Short Answer, Analysis, Caveats).' },
      notes: { type: 'string', description: 'Caveats, or things the attorney should specifically verify before relying on this.' },
    },
    required: ['content', 'notes'],
  },
}

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: MAX_SEARCH_USES,
}

function extractSources(content: Anthropic.ContentBlock[]): ResearchSource[] {
  const seen = new Map<string, ResearchSource>()
  for (const block of content) {
    if (block.type !== 'web_search_tool_result') continue
    if (!Array.isArray(block.content)) continue
    for (const item of block.content) {
      if (!item.url) continue
      if (!seen.has(item.url)) seen.set(item.url, { title: item.title || item.url, url: item.url })
    }
  }
  return Array.from(seen.values())
}

function findSubmitToolUse(content: Anthropic.ContentBlock[]): { content: string; notes: string } | null {
  const toolUse = content.find((c) => c.type === 'tool_use' && c.name === 'submit_research_memo')
  if (!toolUse || toolUse.type !== 'tool_use') return null
  const parsed = toolUse.input as { content: string; notes: string }
  return { content: parsed.content, notes: parsed.notes }
}

const anthropicTransport: ResearchTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userMessage =
    `Legal research question: ${input.question}` +
    (input.matterCaseName ? `\nMatter context: ${input.matterCaseName}` : '')

  const firstResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [WEB_SEARCH_TOOL, SUBMIT_TOOL],
  })

  const sources = extractSources(firstResponse.content)
  const submitted = findSubmitToolUse(firstResponse.content)
  if (submitted) {
    return { content: submitted.content, notes: submitted.notes, sources }
  }

  // The model researched but didn't call the submit tool -- one bounded
  // follow-up, now safe to force the tool since research is already done.
  const secondResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: firstResponse.content },
      { role: 'user', content: 'Now call submit_research_memo with your final answer.' },
    ],
    tools: [SUBMIT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_research_memo' },
  })

  const finalSubmitted = findSubmitToolUse(secondResponse.content)
  if (!finalSubmitted) {
    throw new AiLegalResearchError('AI legal research failed: no structured response returned')
  }
  return {
    content: finalSubmitted.content,
    notes: finalSubmitted.notes,
    sources: sources.length > 0 ? sources : extractSources(secondResponse.content),
  }
}

export async function researchLegalQuestion(
  input: LegalResearchInput,
  transport: ResearchTransport = anthropicTransport
): Promise<LegalResearchResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiLegalResearchError('AI Legal Research is not configured (ANTHROPIC_API_KEY is not set)')
  }
  return transport(input)
}
