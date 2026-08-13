import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requirePrivilegedCreator() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'signups')) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { admin }
}

// Organizations awaiting approval (is_active: false), newest first.
export async function GET() {
  const auth = await requirePrivilegedCreator()
  if (auth.error) return auth.error

  const { data: orgs, error } = await supabaseAdmin
    .from('organizations')
    .select('*, users(id, email, role)')
    .eq('is_active', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ organizations: orgs })
}

// Approves a pending signup -- flips is_active to true, the exact flag
// checked at login (src/app/api/auth/login/route.ts) and on every request
// (middleware.ts).
export async function PATCH(request: Request) {
  const auth = await requirePrivilegedCreator()
  if (auth.error) return auth.error

  const { orgId } = await request.json()
  if (!orgId) return NextResponse.json({ error: 'orgId is required' }, { status: 400 })

  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .update({ is_active: true })
    .eq('id', orgId)
    .eq('is_active', false)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!org) return NextResponse.json({ error: 'Organization not found or already approved' }, { status: 404 })

  return NextResponse.json({ organization: org })
}

// Rejects a pending signup -- deletes the org and everything a fresh
// signup could possibly have accumulated before ever reaching the app
// (registration only seeds subscriptions/chart_of_accounts/leave_types,
// and the pending-approval gate blocks everything else). Safe because a
// still-pending org has no real customer activity to lose.
export async function DELETE(request: Request) {
  const auth = await requirePrivilegedCreator()
  if (auth.error) return auth.error

  const { orgId } = await request.json()
  if (!orgId) return NextResponse.json({ error: 'orgId is required' }, { status: 400 })

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, is_active')
    .eq('id', orgId)
    .single()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  if (org.is_active) {
    return NextResponse.json({ error: 'Cannot reject an already-approved organization' }, { status: 400 })
  }

  const { data: users } = await supabaseAdmin.from('users').select('id').eq('tenant_id', orgId)

  for (const table of ['subscriptions', 'chart_of_accounts', 'leave_types', 'users']) {
    await supabaseAdmin.from(table).delete().eq('tenant_id', orgId)
  }
  await supabaseAdmin.from('organizations').delete().eq('id', orgId)

  for (const u of users || []) {
    await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
