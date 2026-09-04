import Anthropic from '@anthropic-ai/sdk'
import { coalesceTurns, type ChatTurn } from './chat-utils'

// Mirrors support-chat.ts's shape exactly (transport-injectable, throws
// clearly when unconfigured, non-streaming, plain-text output). The
// difference is the system prompt's dynamic half: instead of a fixed
// FirmTrack description, it's the firm's own admin-authored persona
// instructions for this specific agent.

export type ExpertAgentChatMessage = ChatTurn

export type ExpertAgentChatInput = {
  agentName: string
  agentInstructions: string
  history: ExpertAgentChatMessage[] // prior turns in this conversation, oldest first
}

export type ExpertAgentChatResult = {
  reply: string
  usage: { inputTokens: number; outputTokens: number }
}

export type SendTransport = (input: ExpertAgentChatInput) => Promise<ExpertAgentChatResult>

export class AiExpertAgentError extends Error {}

function buildSystemPrompt(agentName: string, agentInstructions: string): string {
  return (
    `You are "${agentName}", a custom AI expert persona configured by this law firm for their ` +
    'own staff to consult. Your expertise and behavior are defined entirely by the firm\'s own ' +
    'instructions below -- stay within that configured scope, and if a question falls outside it, ' +
    'say so plainly rather than guessing. This is a firm-configured tool, not a substitute for ' +
    'actual professional or legal advice from a qualified human expert -- make that clear when the ' +
    "stakes are meaningfully high. Be concise and practical.\n\n" +
    `Firm-configured instructions for "${agentName}":\n${agentInstructions}`
  )
}

const anthropicTransport: SendTransport = async (input) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messages = coalesceTurns(input.history)

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: buildSystemPrompt(input.agentName, input.agentInstructions),
    messages,
  })

  const textBlock = res.content.find((c) => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new AiExpertAgentError('AI expert agent chat failed: no text response returned')
  }
  return {
    reply: textBlock.text,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  }
}

export async function sendExpertAgentMessage(
  input: ExpertAgentChatInput,
  transport: SendTransport = anthropicTransport
): Promise<ExpertAgentChatResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiExpertAgentError('AI Expert Agent is not configured (ANTHROPIC_API_KEY is not set)')
  }
  if (input.history.length === 0) {
    throw new AiExpertAgentError('AI expert agent chat requires at least one message')
  }
  return transport(input)
}
