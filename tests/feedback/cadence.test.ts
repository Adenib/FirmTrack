import { describe, it, expect } from 'vitest'
import { nextPromptDelayDays } from '@/lib/feedback/cadence'

describe('nextPromptDelayDays', () => {
  it('schedules 30 days after the first prompt (prompt_count 0 going into it)', () => {
    expect(nextPromptDelayDays(0)).toBe(30)
  })

  it('schedules 45 days after the second prompt (prompt_count 1 going into it)', () => {
    expect(nextPromptDelayDays(1)).toBe(45)
  })

  it('stays at 45 days for every prompt after that', () => {
    expect(nextPromptDelayDays(2)).toBe(45)
    expect(nextPromptDelayDays(10)).toBe(45)
  })
})
