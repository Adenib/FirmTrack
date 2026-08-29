import { describe, it, expect, afterEach } from 'vitest'
import { draftDocument, AiDocumentDraftError, type DocumentDraftInput, type DocumentDraftResult } from '@/lib/ai/document-draft'

describe('draftDocument (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: DocumentDraftInput = {
    documentType: 'NDA',
    matterCaseName: 'Acme Corp v. Beta Ltd',
    prompt: 'A mutual NDA between Acme Corp and Beta Ltd for a joint venture discussion.',
  }

  const sampleResult: DocumentDraftResult = {
    content: 'NON-DISCLOSURE AGREEMENT\n\nThis Agreement is entered into between Acme Corp and Beta Ltd...',
    notes: 'Confirm governing law and jurisdiction before use.',
  }

  it('throws AiDocumentDraftError without ever calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return sampleResult
    }

    await expect(draftDocument(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiDocumentDraftError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let receivedInput: DocumentDraftInput | null = null
    const stubTransport = async (input: DocumentDraftInput) => {
      receivedInput = input
      return sampleResult
    }

    const result = await draftDocument(sampleInput, stubTransport)

    expect(result).toEqual(sampleResult)
    expect(receivedInput).toEqual(sampleInput)
  })

  it('works with no matter context (firm-wide draft)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    const withoutMatter: DocumentDraftInput = { ...sampleInput, matterCaseName: null }
    const stubTransport = async () => sampleResult

    const result = await draftDocument(withoutMatter, stubTransport)
    expect(result).toEqual(sampleResult)
  })
})
