// AssetTrack has no dedicated 'it' role -- owner/admin/manager act as "IT
// staff" (triage, diagnosis, decisions, vendor/parts, asset register
// writes). Single source of truth imported by every route and UI check.
export const ASSETTRACK_STAFF_ROLES = ['owner', 'admin', 'manager']
