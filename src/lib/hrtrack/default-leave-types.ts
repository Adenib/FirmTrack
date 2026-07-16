// The 6 default leave types seeded per tenant. Kept in sync by hand with
// the backfill block in supabase/migrations/20260721090000_hrtrack_leave_populate.sql
// (migrations are pure SQL, so there's no shared import between the two —
// if you add/change a type here, mirror it there too).
export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual', annual_days: 20, unlimited: false },
  { name: 'Maternity', annual_days: 90, unlimited: false },
  { name: 'Compassionate', annual_days: 5, unlimited: false },
  { name: 'Sick', annual_days: 10, unlimited: false },
  { name: 'Study/Exams', annual_days: 10, unlimited: false },
  { name: 'Unpaid', annual_days: 0, unlimited: true },
] as const
