import { describe, it, expect, afterEach } from 'vitest'
import {
  researchLegalQuestion,
  AiLegalResearchError,
  type LegalResearchInput,
  type LegalResearchResult,
} from '@/lib/ai/legal-research'

describe('researchLegalQuestion (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: LegalResearchInput = {
    question: 'What are the requirements for a valid contract under Nigerian law?',
    matterCaseName: 'Acme Corp v. Beta Ltd',
  }

  const sampleResult: LegalResearchResult = {
    content: 'Question Presented...\nShort Answer...\nAnalysis...\nCaveats...',
    sources: [{ title: 'Example Law Review', url: 'https://example.test/article' }],
    notes: 'Confirm the applicable jurisdiction before relying on this.',
  }

  it('throws AiLegalResearchError without ever calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return sampleResult
    }

    await expect(researchLegalQuestion(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiLegalResearchError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let receivedInput: LegalResearchInput | null = null
    const stubTransport = async (input: LegalResearchInput) => {
      receivedInput = input
      return sampleResult
    }

    const result = await researchLegalQuestion(sampleInput, stubTransport)

    expect(result).toEqual(sampleResult)
    expect(receivedInput).toEqual(sampleInput)
  })

  it('works with no matter context (firm-wide research)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    const withoutMatter: LegalResearchInput = { ...sampleInput, matterCaseName: null }
    const stubTransport = async () => sampleResult

    const result = await researchLegalQuestion(withoutMatter, stubTransport)
    expect(result).toEqual(sampleResult)
  })

  // ANTHROPIC_API_KEY is genuinely configured in this environment (see
  // document-drafts-route.test.ts), so this exercises the real pipeline --
  // Claude, real web search, structured output -- against a realistic
  // legal question, not a stub. This is the first agentic (multi-step
  // tool use) AI feature in this codebase: asserts the shape holds up
  // (non-empty content/notes, sources is an array) without asserting on
  // exact content, since a live web search's results aren't deterministic.
  it('produces a real, structurally sound research memo for a realistic question', async () => {
    const result = await researchLegalQuestion({
      question: 'What is the doctrine of privity of contract, and what are its major exceptions?',
      matterCaseName: null,
    })

    expect(typeof result.content).toBe('string')
    expect(result.content.length).toBeGreaterThan(0)
    expect(typeof result.notes).toBe('string')
    expect(result.notes.length).toBeGreaterThan(0)
    expect(Array.isArray(result.sources)).toBe(true)
    for (const source of result.sources) {
      expect(typeof source.title).toBe('string')
      expect(typeof source.url).toBe('string')
    }
  }, 60000)
})
