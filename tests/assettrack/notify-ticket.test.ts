import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { notifyAssetTicketSubmitted, notifyAssetTicketReporter } from '@/lib/assettrack/notify-ticket'

const ENV_KEYS = ['RESEND_API_KEY', 'ASSETTRACK_FROM_EMAIL', 'SUPPORT_FROM_EMAIL', 'BILLTRACK_FROM_EMAIL'] as const
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('notifyAssetTicketSubmitted', () => {
  it('reports not sent when email sending is not configured', async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.ASSETTRACK_FROM_EMAIL
    delete process.env.SUPPORT_FROM_EMAIL
    delete process.env.BILLTRACK_FROM_EMAIL

    const result = await notifyAssetTicketSubmitted({ to: 'it@aelex.com', subject: 'x', html: '<p>x</p>' })
    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/not configured/i)
  })

  it('reports not sent when there is no recipient configured for the tenant', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.ASSETTRACK_FROM_EMAIL = 'noreply@firmtracks.com'

    const result = await notifyAssetTicketSubmitted({ to: '', subject: 'x', html: '<p>x</p>' })
    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/no it notification email/i)
  })

  it('calls the transport with the right arguments and reports sent on success', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.ASSETTRACK_FROM_EMAIL = 'noreply@firmtracks.com'

    const calls: unknown[] = []
    const result = await notifyAssetTicketSubmitted(
      { to: 'it@aelex.com', subject: 'New ticket', html: '<p>details</p>' },
      async (args) => {
        calls.push(args)
      }
    )

    expect(result.sent).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      apiKey: 'test-key',
      fromEmail: 'noreply@firmtracks.com',
      to: 'it@aelex.com',
      subject: 'New ticket',
      html: '<p>details</p>',
    })
  })

  it('reports not sent, not thrown, when the transport itself fails', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.ASSETTRACK_FROM_EMAIL = 'noreply@firmtracks.com'

    const result = await notifyAssetTicketSubmitted(
      { to: 'it@aelex.com', subject: 'x', html: '<p>x</p>' },
      async () => {
        throw new Error('Resend API error (500): boom')
      }
    )

    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/boom/)
  })
})

describe('notifyAssetTicketReporter', () => {
  it('reports not sent with a reporter-specific message when there is no recipient', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.ASSETTRACK_FROM_EMAIL = 'noreply@firmtracks.com'

    const result = await notifyAssetTicketReporter({ to: '', subject: 'x', html: '<p>x</p>' })
    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/no reporter email/i)
  })

  it('calls the transport and reports sent on success', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.ASSETTRACK_FROM_EMAIL = 'noreply@firmtracks.com'

    const calls: unknown[] = []
    const result = await notifyAssetTicketReporter(
      { to: 'staff@example.com', subject: 'Your laptop is ready', html: '<p>ready</p>' },
      async (args) => {
        calls.push(args)
      }
    )

    expect(result.sent).toBe(true)
    expect(calls[0]).toMatchObject({ to: 'staff@example.com', subject: 'Your laptop is ready' })
  })
})
