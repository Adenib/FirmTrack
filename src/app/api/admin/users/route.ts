import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logSecurityEvent } from '@/lib/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 'owner' is deliberately excluded -- ownership transfer is a more
// sensitive operation than a routine role change and isn't handled here.
const ASSIGNABLE_ROLES = ['staff', 'manager', 'accounts', 'hr', 'admin']

async function requirePrivilegedRequester(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: requesterProfile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!requesterProfile || !['owner', 'admin'].includes(requesterProfile.role)) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }

  return { user, requesterProfile }
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const auth = await requirePrivilegedRequester(supabase)
  if ('error' in auth) return auth.error
  const { user, requesterProfile } = auth

  const { email, role, password } = await request.json()

  if (!email || !role || !password) {
    return NextResponse.json({ error: 'email, role, and password are required' }, { status: 400 })
  }

  const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !newAuthUser.user) {
    return NextResponse.json({ error: createError?.message || 'Could not create user' }, { status: 500 })
  }

  const { error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id: newAuthUser.user.id,
      tenant_id: requesterProfile.tenant_id,
      email,
      role,
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  await logSecurityEvent({
    eventType: 'user_created',
    email,
    userId: user.id,
    tenantId: requesterProfile.tenant_id,
    request,
    metadata: { createdUserId: newAuthUser.user.id, role },
  })

  return NextResponse.json({ success: true, userId: newAuthUser.user.id })
}

// Role change -- blocks changing role to/from 'owner' and blocks changing
// your own role (self-lockout guard: an admin demoting themselves out of
// admin with no one else around to undo it is a real footgun).
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const auth = await requirePrivilegedRequester(supabase)
  if ('error' in auth) return auth.error
  const { user, requesterProfile } = auth

  const body = await request.json()
  const { id } = body

  // Sign-out-everywhere -- unlike role change/deactivation this isn't
  // destructive (the user can just log back in immediately), so there's
  // no self/owner lockout risk to guard against here.
  if (body.revokeSessions) {
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const { data: target } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', id)
      .eq('tenant_id', requesterProfile.tenant_id)
      .single()
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { error } = await supabaseAdmin.from('users').update({ sessions_revoked_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logSecurityEvent({
      eventType: 'session_revoked',
      email: target.email,
      userId: user.id,
      tenantId: requesterProfile.tenant_id,
      request,
      metadata: { targetUserId: id },
    })

    return NextResponse.json({ success: true })
  }

  // Admin-assisted MFA reset -- the everyone-else half of the recovery
  // model (owner/admin have self-service backup codes instead). Removes
  // the target's TOTP factor(s) via the admin API so they re-enroll fresh
  // on next login; not destructive (no lockout), so no self/owner guard.
  if (body.resetMfa) {
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const { data: target } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', id)
      .eq('tenant_id', requesterProfile.tenant_id)
      .single()
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: id })
    for (const factor of factors?.factors || []) {
      await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: id, id: factor.id })
    }

    await logSecurityEvent({
      eventType: 'mfa_reset',
      email: target.email,
      userId: user.id,
      tenantId: requesterProfile.tenant_id,
      request,
      metadata: { targetUserId: id, method: 'admin' },
    })

    return NextResponse.json({ success: true })
  }

  const { role } = body
  if (!id || !role) return NextResponse.json({ error: 'id and role are required' }, { status: 400 })
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 })
  }
  if (id === user.id) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
  }

  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, email, role')
    .eq('id', id)
    .eq('tenant_id', requesterProfile.tenant_id)
    .single()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json({ error: "The owner's role cannot be changed here" }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('users').update({ role }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSecurityEvent({
    eventType: 'user_role_changed',
    email: target.email,
    userId: user.id,
    tenantId: requesterProfile.tenant_id,
    request,
    metadata: { targetUserId: id, from: target.role, to: role },
  })

  return NextResponse.json({ success: true })
}

// Soft deactivate/reactivate -- never a real row delete, since lawyer_id/
// created_by/etc. FKs across the app point at users.id. Blocks acting on
// 'owner' or yourself, same reasoning as the role-change guard above.
export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const auth = await requirePrivilegedRequester(supabase)
  if ('error' in auth) return auth.error
  const { user, requesterProfile } = auth

  const { id, reactivate } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (id === user.id) {
    return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
  }

  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, email, role')
    .eq('id', id)
    .eq('tenant_id', requesterProfile.tenant_id)
    .single()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'The owner cannot be deactivated' }, { status: 400 })
  }

  const isActive = !!reactivate
  const { error } = await supabaseAdmin.from('users').update({ is_active: isActive }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSecurityEvent({
    eventType: isActive ? 'user_reactivated' : 'user_deactivated',
    email: target.email,
    userId: user.id,
    tenantId: requesterProfile.tenant_id,
    request,
    metadata: { targetUserId: id },
  })

  return NextResponse.json({ success: true })
}
