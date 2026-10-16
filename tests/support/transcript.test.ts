import { describe, it, expect } from 'vitest'
import { buildTranscriptEmail } from '@/lib/support/transcript'

describe('buildTranscriptEmail', () => {
  const request = {
    id: '12345678-aaaa-bbbb-cccc-000000000000',
    subject: 'Cannot export invoice',
    description: 'The export button does nothing.',
    severity: 'B',
    channel: 'standard',
  }

  it('includes a reference built from the request id and the subject in the email subject line', () => {
    const { subject, reference } = buildTranscriptEmail(request, [])
    expect(reference).toBe('SR-12345678')
    expect(subject).toContain('SR-12345678')
    expect(subject).toContain('Cannot export invoice')
  })

  it('includes the original description and every message, labeled by sender', () => {
    const { html } = buildTranscriptEmail(request, [
      { sender_type: 'user', body: 'Still happening on Chrome.', created_at: '2026-10-16T10:00:00Z' },
      { sender_type: 'agent', body: 'Try clearing your cache.', created_at: '2026-10-16T10:05:00Z' },
    ])
    expect(html).toContain('The export button does nothing.')
    expect(html).toContain('Subscriber')
    expect(html).toContain('Still happening on Chrome.')
    expect(html).toContain('FirmTrack Support')
    expect(html).toContain('Try clearing your cache.')
  })

  it('labels an AI Assistant message distinctly from an agent message', () => {
    const { html } = buildTranscriptEmail(request, [
      { sender_type: 'ai', body: 'Here is how to export.', created_at: '2026-10-16T10:00:00Z' },
    ])
    expect(html).toContain('AI Assistant')
    expect(html).not.toContain('FirmTrack Support')
  })
})
