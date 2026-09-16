import { describe, it, expect, afterEach } from 'vitest'
import { reviewTabularFields, AiTabularReviewError, type TabularReviewInput, type TabularReviewResult } from '@/lib/ai/tabular-review'

describe('reviewTabularFields (pure, transport injected)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  const sampleInput: TabularReviewInput = {
    documentTitle: 'Office Lease Agreement',
    documentText: 'This Lease Agreement is entered into as of March 1, 2026, between Landlord and Tenant, governed by the laws of Lagos State. The lease term is 3 years.',
    fields: [
      { label: 'Effective Date', instructions: "Extract the agreement's effective date." },
      { label: 'Governing Law', instructions: 'Extract the governing law/jurisdiction.' },
    ],
  }

  const sampleResult: TabularReviewResult = {
    values: [
      { label: 'Effective Date', value: 'March 1, 2026', notes: '' },
      { label: 'Governing Law', value: 'Lagos State', notes: '' },
    ],
  }

  it('throws AiTabularReviewError without calling the transport when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let called = false
    const stubTransport = async () => {
      called = true
      return sampleResult
    }

    await expect(reviewTabularFields(sampleInput, stubTransport)).rejects.toBeInstanceOf(AiTabularReviewError)
    expect(called).toBe(false)
  })

  it('throws AiTabularReviewError without calling the transport when fields is empty', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let called = false
    const stubTransport = async () => {
      called = true
      return sampleResult
    }

    await expect(reviewTabularFields({ ...sampleInput, fields: [] }, stubTransport)).rejects.toBeInstanceOf(AiTabularReviewError)
    expect(called).toBe(false)
  })

  it('passes input through to the transport and returns its result when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
    let received: TabularReviewInput | null = null
    const stubTransport = async (input: TabularReviewInput) => {
      received = input
      return sampleResult
    }

    const result = await reviewTabularFields(sampleInput, stubTransport)

    expect(result).toEqual(sampleResult)
    expect(received).toEqual(sampleInput)
  })

  // ANTHROPIC_API_KEY is genuinely configured in this environment, so
  // this exercises the real pipeline (Claude -> structured output)
  // against a realistic document and field set, not a stub.
  it('produces a real, correctly-shaped extraction for a realistic document', async () => {
    const result = await reviewTabularFields({
      documentTitle: 'Office Lease Agreement',
      documentText: 'This Lease Agreement is entered into as of March 1, 2026, between Landlord and Tenant, governed by the laws of Lagos State. The lease term is 3 years. There is no mention of a renewal option anywhere in this document.',
      fields: [
        { label: 'Effective Date', instructions: "Extract the agreement's effective date." },
        { label: 'Renewal Option', instructions: 'Does the lease include a renewal option?' },
      ],
    })

    expect(result.values).toHaveLength(2)
    const labels = result.values.map((v) => v.label)
    expect(labels).toContain('Effective Date')
    expect(labels).toContain('Renewal Option')
    const effectiveDate = result.values.find((v) => v.label === 'Effective Date')!
    expect(effectiveDate.value).toContain('2026')
    const renewal = result.values.find((v) => v.label === 'Renewal Option')!
    expect(renewal.value.toLowerCase()).toMatch(/^no\b|not specified|no renewal|does not|no mention/)
  }, 30000)
})
