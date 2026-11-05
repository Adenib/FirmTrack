import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// Same admin-sets-the-password pattern as /api/admin/users (no email-
// invite flow exists anywhere in this codebase yet) -- owner/admin shares
// the password with the vendor contact out of band. A vendor email is
// globally unique across every FirmTrack tenant's Supabase Auth (same
// constraint staff accounts already have), so inviting an address that
// already has a portal account elsewhere in FirmTrack is rejected rather
// than silently reusing that identity.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin access required' }, { status: 403 })
  }

  const { vendor_id, email, password } = await request.json()
  if (!vendor_id || !email || !password) {
    return NextResponse.json({ error: 'vendor_id, email, and password are required' }, { status: 400 })
  }

  const { data: vendor } = await supabaseAdmin
    .from('vendors')
    .select('id')
    .eq('id', vendor_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!vendor) return NextResponse.json({ error: 'Unknown vendor_id' }, { status: 400 })

  const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !newAuthUser.user) {
    return NextResponse.json({ error: createError?.message || 'Could not create portal account' }, { status: 400 })
  }

  const { data: portalUser, error } = await supabaseAdmin
    .from('vendor_portal_users')
    .insert({ tenant_id: profile.tenant_id, vendor_id, email, auth_user_id: newAuthUser.user.id })
    .select()
    .single()
  if (error) {
    // Roll back the auth user so a failed invite doesn't leave an orphaned
    // account nothing else references.
    await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ portalUser }, { status: 201 })
}
