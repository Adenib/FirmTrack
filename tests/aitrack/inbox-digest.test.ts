import { describe, it, expect, afterEach } from 'vitest'
import {
  summarizeInboxDigest,
  AiInboxDigestError,
  type InboxDigestInput,
  type InboxDigestResult,
} from '@/lib/ai/inbox-digest'

describe('summarizeInboxDigest (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: InboxDigestInput = {
    messages: [
      {
        id: 'msg-1',
        subject: 'Re: Discovery deadline',
        from: 'opposing.counsel@example.test',
        receivedDateTime: '2026-09-02T14:00:00Z',
        bodyPreview: 'Can we agree to a one-week extension on the discovery deadline for the Acme matter?',
      },
      {
        id: 'msg-2',
        subject: 'Your weekly newsletter',
        from: 'newsletter@lawtimes.test',
        receivedDateTime: '2026-09-02T09:00:00Z',
        bodyPreview: 'This week in legal news...',
      },
    ],
  }

  const sampleResult: InboxDigestResult = {
    entries: [
      { id: 'msg-1', priority: 'high', summary: 'Opposing counsel requests a one-week discovery extension.', suggestedReply: 'That extension works for us.' },
      { id: 'msg-2', priority: 'no_action', summary: 'Weekly legal news newsletter.', suggestedReply: null },
    ],
  }

  it('throws AiInboxDigestError without ever calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return sampleResult
    }

    await expect(summarizeInboxDigest(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiInboxDigestError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let receivedInput: InboxDigestInput | null = null
    const stubTransport = async (input: InboxDigestInput) => {
      receivedInput = input
      return sampleResult
    }

    const result = await summarizeInboxDigest(sampleInput, stubTransport)

    expect(result).toEqual(sampleResult)
    expect(receivedInput).toEqual(sampleInput)
  })

  // ANTHROPIC_API_KEY is genuinely configured in this environment (see
  // document-drafts-route.test.ts), so this exercises the real pipeline
  // (Claude -> structured output) against realistic fabricated email data,
  // not a stub -- the one piece of this feature that CAN be verified
  // end-to-end without a real connected Microsoft 365 mailbox.
  it('produces a sensible real digest for a realistic mixed inbox', async () => {
    const result = await summarizeInboxDigest({
      messages: [
        {
          id: 'real-1',
          subject: 'Urgent: motion filing deadline tomorrow',
          from: 'partner@firmtrack-test.local',
          receivedDateTime: '2026-09-02T16:00:00Z',
          bodyPreview: 'We need to file the motion to dismiss by 5pm tomorrow. Can you confirm the draft is ready?',
        },
        {
          id: 'real-2',
          subject: 'Weekly CLE newsletter',
          from: 'noreply@clenews.test',
          receivedDateTime: '2026-09-02T08:00:00Z',
          bodyPreview: 'This week: 5 upcoming webinars on ethics and compliance.',
        },
      ],
    }, undefined)

    expect(result.entries).toHaveLength(2)
    const ids = result.entries.map((e) => e.id)
    expect(ids).toContain('real-1')
    expect(ids).toContain('real-2')
    const urgent = result.entries.find((e) => e.id === 'real-1')!
    expect(['high', 'medium']).toContain(urgent.priority)
    expect(urgent.summary.length).toBeGreaterThan(0)
    const newsletter = result.entries.find((e) => e.id === 'real-2')!
    expect(newsletter.priority).toBe('no_action')
  }, 30000)
})
