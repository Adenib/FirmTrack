import { describe, it, expect, afterEach } from 'vitest'
import { sendSupportMessage, AiSupportError, type SupportChatInput } from '@/lib/ai/support-chat'

describe('sendSupportMessage (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: SupportChatInput = {
    subject: 'Cannot see AccountTrack',
    description: 'The module seems locked even though we subscribed.',
    history: [{ role: 'user', content: 'Cannot see AccountTrack' }],
  }

  it('throws AiSupportError without calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return { reply: 'reply', usage: { inputTokens: 0, outputTokens: 0 } }
    }

    await expect(sendSupportMessage(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiSupportError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result (reply + token usage) when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let received: SupportChatInput | null = null
    const stubTransport = async (input: SupportChatInput) => {
      received = input
      return { reply: 'Try refreshing -- subscriptions can take a minute to activate.', usage: { inputTokens: 120, outputTokens: 18 } }
    }

    const result = await sendSupportMessage(sampleInput, stubTransport)

    expect(result.reply).toBe('Try refreshing -- subscriptions can take a minute to activate.')
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 18 })
    expect(received).toEqual(sampleInput)
  })
})
