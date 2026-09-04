import { describe, it, expect, afterEach } from 'vitest'
import { sendExpertAgentMessage, AiExpertAgentError, type ExpertAgentChatInput } from '@/lib/ai/expert-agent-chat'

describe('sendExpertAgentMessage (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: ExpertAgentChatInput = {
    agentName: 'Employment Law Expert',
    agentInstructions: 'You are our firm\'s employment law expert. Answer questions about Nigerian labor law.',
    history: [{ role: 'user', content: 'What notice period is required for termination without cause?' }],
  }

  it('throws AiExpertAgentError without calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return { reply: 'reply', usage: { inputTokens: 0, outputTokens: 0 } }
    }

    await expect(sendExpertAgentMessage(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiExpertAgentError)
    expect(called).toBe(false)
  })

  it('throws AiExpertAgentError without calling the transport when history is empty', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let called = false
    const stubTransport = async () => {
      called = true
      return { reply: 'reply', usage: { inputTokens: 0, outputTokens: 0 } }
    }

    await expect(sendExpertAgentMessage({ ...sampleInput, history: [] }, stubTransport)).rejects.toBeInstanceOf(AiExpertAgentError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result (reply + token usage) when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let received: ExpertAgentChatInput | null = null
    const stubTransport = async (input: ExpertAgentChatInput) => {
      received = input
      return { reply: 'Typically one month, per the applicable labour act -- confirm against the actual contract terms.', usage: { inputTokens: 90, outputTokens: 22 } }
    }

    const result = await sendExpertAgentMessage(sampleInput, stubTransport)

    expect(result.reply).toContain('one month')
    expect(result.usage).toEqual({ inputTokens: 90, outputTokens: 22 })
    expect(received).toEqual(sampleInput)
  })

  // ANTHROPIC_API_KEY is genuinely configured in this environment, so
  // this exercises the real pipeline (Claude, system prompt built from
  // agentName/agentInstructions, coalesceTurns), not a stub.
  it('produces a real reply grounded in the configured persona', async () => {
    const result = await sendExpertAgentMessage({
      agentName: 'Employment Law Expert',
      agentInstructions: 'You are this firm\'s employment law expert, focused on Nigerian labor law and staff contracts.',
      history: [{ role: 'user', content: 'In one sentence, what is your area of expertise?' }],
    })

    expect(typeof result.reply).toBe('string')
    expect(result.reply.length).toBeGreaterThan(0)
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  }, 30000)
})
