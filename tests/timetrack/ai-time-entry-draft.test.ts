import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { draftTimeEntry, AiDraftError, type DraftTimeEntryInput } from '@/lib/ai/time-entry-draft'

describe('draftTimeEntry (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: DraftTimeEntryInput = {
    eventTitle: 'Call with client re: settlement terms',
    eventDescription: 'Discuss counteroffer',
    matterCaseName: 'Acme Corp v. Beta Ltd',
    durationHours: 1.5,
    taskCodes: [{ code: 'A107', description: 'Communicate with client' }],
  }

  it('throws AiDraftError without ever calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return { narrative: 'x', suggestedTaskCode: null }
    }

    await expect(draftTimeEntry(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiDraftError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let receivedInput: DraftTimeEntryInput | null = null
    const stubTransport = async (input: DraftTimeEntryInput) => {
      receivedInput = input
      return { narrative: 'Drafted narrative.', suggestedTaskCode: 'A107' }
    }

    const result = await draftTimeEntry(sampleInput, stubTransport)

    expect(result).toEqual({ narrative: 'Drafted narrative.', suggestedTaskCode: 'A107' })
    expect(receivedInput).toEqual(sampleInput)
  })
})
