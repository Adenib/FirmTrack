import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessCreatorPage, type CreatorPage } from './creator-permissions'

export async function getCreatorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // status defaults to 'active' at the DB level, but a deactivated staff
  // member's row still exists — must be checked explicitly, not just
  // "does a row exist."
  if (!admin || admin.status === 'inactive') {
    redirect('/dashboard')
  }

  return { user, admin }
}

// Same base check as getCreatorContext(), plus a per-page cadre check —
// use this in any /creator/* page whose access should vary by cadre.
// Redirects to /creator (Overview, which every cadre can reach) rather
// than /dashboard, since the user IS a valid platform admin, just not for
// this particular page.
export async function requireCreatorPageAccess(page: CreatorPage) {
  const { user, admin } = await getCreatorContext()
  if (!canAccessCreatorPage(admin.role, page)) {
    redirect('/creator')
  }
  return { user, admin }
}
