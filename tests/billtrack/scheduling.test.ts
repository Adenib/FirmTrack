import { describe, it, expect } from 'vitest'
import { isMatterDueForAutoInvoice, isInvoiceDueForReminder } from '@/lib/billtrack/scheduling'

describe('isMatterDueForAutoInvoice', () => {
  it('monthly: due when today matches the anchor day', () => {
    const matter = { billing_frequency: 'monthly' as const, billing_anchor_day: 15 }
    expect(isMatterDueForAutoInvoice(matter, new Date(2026, 6, 15))).toBe(true)
    expect(isMatterDueForAutoInvoice(matter, new Date(2026, 6, 16))).toBe(false)
  })

  it('quarterly: due on the anchor day only in calendar-quarter-start months', () => {
    const matter = { billing_frequency: 'quarterly' as const, billing_anchor_day: 1 }
    expect(isMatterDueForAutoInvoice(matter, new Date(2026, 0, 1))).toBe(true) // Jan
    expect(isMatterDueForAutoInvoice(matter, new Date(2026, 3, 1))).toBe(true) // Apr
    expect(isMatterDueForAutoInvoice(matter, new Date(2026, 1, 1))).toBe(false) // Feb
    expect(isMatterDueForAutoInvoice(matter, new Date(2026, 3, 2))).toBe(false) // wrong day
  })

  it('custom: never auto-due, regardless of date', () => {
    const matter = { billing_frequency: 'custom' as const, billing_anchor_day: 1 }
    expect(isMatterDueForAutoInvoice(matter, new Date(2026, 0, 1))).toBe(false)
  })
})

describe('isInvoiceDueForReminder', () => {
  const now = new Date(2026, 6, 15)

  it('never sent (lastSentAt null): due immediately regardless of cadence', () => {
    const invoice = { status: 'open', reminders_paused: false }
    expect(isInvoiceDueForReminder(invoice, null, 7, now)).toBe(true)
  })

  it('sent recently: not due until cadence elapses', () => {
    const invoice = { status: 'open', reminders_paused: false }
    const threeDaysAgo = new Date(2026, 6, 12)
    expect(isInvoiceDueForReminder(invoice, threeDaysAgo, 7, now)).toBe(false)
  })

  it('sent exactly cadenceDays ago: due', () => {
    const invoice = { status: 'partially_paid', reminders_paused: false }
    const sevenDaysAgo = new Date(2026, 6, 8)
    expect(isInvoiceDueForReminder(invoice, sevenDaysAgo, 7, now)).toBe(true)
  })

  it('paused invoice: never due, even if never sent', () => {
    const invoice = { status: 'open', reminders_paused: true }
    expect(isInvoiceDueForReminder(invoice, null, 7, now)).toBe(false)
  })

  it('paid or void invoice: never due', () => {
    expect(isInvoiceDueForReminder({ status: 'paid', reminders_paused: false }, null, 7, now)).toBe(false)
    expect(isInvoiceDueForReminder({ status: 'void', reminders_paused: false }, null, 7, now)).toBe(false)
  })
})
