// Unlike every other module in this app (matters/clients are tenant-wide
// visible to any active member), DocTrack restricts matter-linked
// documents to that matter's responsible lawyer, plus an owner/admin
// firmwide override -- a deliberate, user-confirmed exception. A
// document with no matter_id (firm-wide templates/policies) has no
// responsible lawyer to restrict by, so it's visible to everyone.
export function canAccessMatterDocument(
  profile: { id: string; role: string },
  matter: { responsible_lawyer: string | null } | null
): boolean {
  if (!matter) return true
  if (['owner', 'admin'].includes(profile.role)) return true
  return matter.responsible_lawyer === profile.id
}
