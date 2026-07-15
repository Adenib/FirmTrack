// Pure eligibility functions for BillTrack's daily cron
// (src/app/api/cron/billtrack-daily/route.ts). Kept dependency-free so
// tests can exercise every branch (due today vs. not, cadence elapsed vs.
// not, paused always excluded) without waiting on real clock ticks or a
// live cron trigger.

export type MatterBillingCycle = {
  billing_frequency: 'monthly' | 'quarterly' | 'custom'
  billing_anchor_day: number
}

// 'custom' matters are never auto-invoiced by the cron — that value means
// the firm handles their timing some other way (manual creation only).
// 'quarterly' fires on the anchor day of calendar-quarter-start months
// (Jan/Apr/Jul/Oct) rather than needing a separate anchor-month column.
export function isMatterDueForAutoInvoice(matter: MatterBillingCycle, today: Date): boolean {
  if (matter.billing_frequency === 'custom') return false
  if (today.getDate() !== matter.billing_anchor_day) return false
  if (matter.billing_frequency === 'monthly') return true
  return today.getMonth() % 3 === 0
}

export type ReminderEligibleInvoice = {
  status: string
  reminders_paused: boolean
}

// True if this invoice should get an email today — either its very first
// notification (lastSentAt === null, sent immediately/regardless of
// cadence) or a follow-up reminder once at least cadenceDays have passed
// since the last send. Paused and paid/void invoices are never due.
export function isInvoiceDueForReminder(
  invoice: ReminderEligibleInvoice,
  lastSentAt: Date | null,
  cadenceDays: number,
  now: Date
): boolean {
  if (invoice.status !== 'open' && invoice.status !== 'partially_paid') return false
  if (invoice.reminders_paused) return false
  if (lastSentAt === null) return true

  const daysSinceLastSend = (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60 * 24)
  return daysSinceLastSend >= cadenceDays
}
