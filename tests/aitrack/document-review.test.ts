import { describe, it, expect, afterEach } from 'vitest'
import { reviewDocument, AiDocumentReviewError, type DocumentReviewInput, type DocumentReviewResult } from '@/lib/ai/document-review'

describe('reviewDocument (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: DocumentReviewInput = {
    documentTitle: 'Non-Disclosure Agreement',
    matterCaseName: 'Acme Corp v. Beta Ltd',
    documentText: 'This Non-Disclosure Agreement is entered into as of January 1, 2026...',
  }

  const sampleResult: DocumentReviewResult = {
    summary: 'A standard mutual NDA.',
    keyTerms: [{ label: 'Term', value: '2 years' }],
    keyDates: [{ label: 'Effective Date', date: '2026-01-01' }],
    riskFlags: [{ severity: 'low', description: 'No unusual terms found.' }],
    playbookResults: null,
  }

  it('throws AiDocumentReviewError without ever calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return sampleResult
    }

    await expect(reviewDocument(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiDocumentReviewError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let receivedInput: DocumentReviewInput | null = null
    const stubTransport = async (input: DocumentReviewInput) => {
      receivedInput = input
      return sampleResult
    }

    const result = await reviewDocument(sampleInput, stubTransport)

    expect(result).toEqual(sampleResult)
    expect(receivedInput).toEqual(sampleInput)
  })

  it('passes playbookRules through when supplied', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    const withPlaybook: DocumentReviewInput = {
      ...sampleInput,
      playbookRules: [{ label: 'Confidentiality definition', instructions: 'Check it is clearly scoped.' }],
    }
    let receivedInput: DocumentReviewInput | null = null
    const stubTransport = async (input: DocumentReviewInput) => {
      receivedInput = input
      return { ...sampleResult, playbookResults: [{ rule_label: 'Confidentiality definition', status: 'pass' as const, notes: 'Clearly scoped.' }] }
    }

    const result = await reviewDocument(withPlaybook, stubTransport)

    expect(receivedInput!.playbookRules).toEqual(withPlaybook.playbookRules)
    expect(result.playbookResults).toHaveLength(1)
  })
})
