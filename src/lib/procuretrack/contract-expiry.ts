// Pure helper -- no I/O. Picks which active contracts are due a renewal
// alert today: exactly 30, 7, or 1 days before end_date, so each contract
// gets three alerts total over its runway rather than one email a day for
// a month straight.
export const CONTRACT_ALERT_DAYS = [30, 7, 1]

export type ContractForAlert = { id: string; title: string; endDate: string }

function daysUntil(dateStr: string, today: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  const end = new Date(dateStr + 'T00:00:00Z')
  const start = new Date(today.toISOString().slice(0, 10) + 'T00:00:00Z')
  return Math.round((end.getTime() - start.getTime()) / msPerDay)
}

export function contractsNeedingAlert(
  contracts: ContractForAlert[],
  today: Date,
  alertDays: number[] = CONTRACT_ALERT_DAYS
): ContractForAlert[] {
  return contracts.filter((c) => alertDays.includes(daysUntil(c.endDate, today)))
}
