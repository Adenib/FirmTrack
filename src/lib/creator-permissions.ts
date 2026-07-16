// Cadre-based access for the Creator Console. 'creator' is the legacy
// full-access role predating this feature (the two original platform
// admins) — kept equivalent to 'admin' so their access is unaffected.
// New staff added via /creator/staff get one of 'admin' | 'accounts' |
// 'developer', each scoped to a subset of the console's pages.
export type CreatorPage = 'overview' | 'organizations' | 'revenue' | 'staff'

const PAGE_ACCESS: Record<CreatorPage, string[]> = {
  overview: ['creator', 'admin', 'accounts', 'developer'],
  organizations: ['creator', 'admin', 'developer'],
  revenue: ['creator', 'admin', 'accounts'],
  staff: ['creator', 'admin'],
}

export function canAccessCreatorPage(role: string, page: CreatorPage): boolean {
  return PAGE_ACCESS[page]?.includes(role) ?? false
}
