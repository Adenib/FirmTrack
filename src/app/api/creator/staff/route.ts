import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CADRES = ['admin', 'accounts', 'developer']

async function requireStaffAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'staff')) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { user, admin }
}

export async function GET() {
  const { error } = await requireStaffAccess()
  if (error) return error

  const { data: staff, error: fetchError } = await supabaseAdmin
    .from('platform_admins')
    .select('id, email, role, full_name, nickname, status, created_at')
    .order('created_at', { ascending: false })

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  return NextResponse.json({ staff })
}

// Creates a brand-new login for the staff member (platform staff aren't
// tied to any tenant, so there's no existing tenant user to pick from —
// mirrors the "create new auth user inline" pattern from
// /api/admin/users, not the "pick an existing user" pattern from
// lawyers/accounts_staff).
export async function POST(request: Request) {
  const { error, user } = await requireStaffAccess()
  if (error) return error

  const { email, password, full_name, nickname, cadre } = await request.json()
  if (!email || !password || !cadre) {
    return NextResponse.json({ error: 'email, password, and cadre are required' }, { status: 400 })
  }
  if (!CADRES.includes(cadre)) {
    return NextResponse.json({ error: `cadre must be one of: ${CADRES.join(', ')}` }, { status: 400 })
  }

  const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !newAuthUser.user) {
    return NextResponse.json({ error: createError?.message || 'Could not create user' }, { status: 500 })
  }

  const { data: staffRow, error: insertError } = await supabaseAdmin
    .from('platform_admins')
    .insert({
      user_id: newAuthUser.user.id,
      email,
      role: cadre,
      full_name: full_name || null,
      nickname: nickname || null,
      added_by: user!.id,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ staff: staffRow })
}

// Toggles active/inactive. Deactivating blocks that person's Creator
// Console access on their next request (getCreatorContext checks status).
// A staff member can't deactivate their own row here, to avoid an
// accidental self-lockout with no one else around to undo it.
export async function PATCH(request: Request) {
  const { error, admin } = await requireStaffAccess()
  if (error) return error

  const { id, status } = await request.json()
  if (!id || !['active', 'inactive'].includes(status)) {
    return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 })
  }

  if (id === admin!.id && status === 'inactive') {
    return NextResponse.json({ error: 'You cannot deactivate your own access' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('platform_admins')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ staff: updated })
}
