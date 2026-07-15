// Who can act on a given invoice's BillTrack actions (send now, pause/resume
// reminders): owner/admin firmwide, Accounts staff firmwide (they field
// client payment questions day-to-day), or the specific matter's
// responsible lawyer (matters.responsible_lawyer, a users.id).
export function canManageInvoice(
  profile: { id: string; role: string },
  matter: { responsible_lawyer: string | null }
): boolean {
  if (['owner', 'admin', 'accounts'].includes(profile.role)) return true
  return !!matter.responsible_lawyer && matter.responsible_lawyer === profile.id
}
