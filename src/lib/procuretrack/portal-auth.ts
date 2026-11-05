import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type VendorPortalProfile = {
  id: string
  tenantId: string
  vendorId: string
  email: string
}

// Vendor portal sessions use the SAME Supabase Auth instance as regular
// FirmTrack staff logins (vendor_portal_users.auth_user_id references
// auth.users directly), but vendor identities are never looked up against
// public.users / the tenant role system -- only against vendor_portal_users.
// A vendor session resolving here must never also resolve as a staff
// profile, and vice versa; the two tables are deliberately disjoint.
export async function getVendorPortalProfile(
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<VendorPortalProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: portalUser } = await supabaseAdmin
    .from('vendor_portal_users')
    .select('id, tenant_id, vendor_id, email')
    .eq('auth_user_id', user.id)
    .single()
  if (!portalUser) return null

  return { id: portalUser.id, tenantId: portalUser.tenant_id, vendorId: portalUser.vendor_id, email: portalUser.email }
}
