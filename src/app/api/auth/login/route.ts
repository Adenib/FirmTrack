import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logSecurityEvent, getClientIp } from '@/lib/audit-log'
import { checkRateLimit, LOGIN_RATE_LIMIT } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    // Checked before Supabase Auth is even called -- a locked-out
    // attempt shouldn't get a real password check, both so the lockout
    // is airtight even if the password happens to be correct, and to
    // avoid needlessly hammering Supabase Auth during an attack.
    const rateLimit = await checkRateLimit({
      eventType: 'login_failure',
      email,
      ip: getClientIp(request),
      ...LOGIN_RATE_LIMIT,
    })
    if (rateLimit.limited) {
      await logSecurityEvent({
        eventType: 'login_failure',
        email,
        request,
        metadata: { reason: 'rate_limited', scope: rateLimit.scope },
      })
      return NextResponse.json({ error: 'Too many failed login attempts. Please try again later.' }, { status: 429 })
    }

    const supabase = await createServerClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session) {
      // No lookup needed for the response (the error message already
      // doesn't distinguish "wrong password" from "no such account"),
      // but a cheap lookup by email lets the log correlate a series of
      // failed attempts against one target account.
      const { data: maybeProfile } = await supabaseAdmin
        .from('users')
        .select('id, tenant_id')
        .eq('email', email)
        .maybeSingle()
      await logSecurityEvent({
        eventType: 'login_failure',
        email,
        userId: maybeProfile?.id,
        tenantId: maybeProfile?.tenant_id,
        request,
      })
      return NextResponse.json({ error: error?.message || 'Login failed' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('tenant_id, is_active')
      .eq('id', data.user.id)
      .single()

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut()
      await logSecurityEvent({
        eventType: 'login_failure',
        email,
        userId: data.user.id,
        tenantId: profile.tenant_id,
        request,
        metadata: { reason: 'deactivated' },
      })
      return NextResponse.json({ error: 'This account has been deactivated' }, { status: 401 })
    }

    if (profile?.tenant_id) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('is_active')
        .eq('id', profile.tenant_id)
        .single()

      if (org && org.is_active === false) {
        await supabase.auth.signOut()
        await logSecurityEvent({
          eventType: 'login_failure',
          email,
          userId: data.user.id,
          tenantId: profile.tenant_id,
          request,
          metadata: { reason: 'org_pending_approval' },
        })
        return NextResponse.json({ error: "Your firm's account is awaiting approval" }, { status: 401 })
      }
    }

    // A fresh token's iat is always after any past revocation moment
    // anyway, so leaving this set wouldn't let a stale session back in --
    // clearing it just keeps the column meaningful to read at a glance
    // (e.g. on the Users page) rather than showing a permanently-stale
    // "revoked" timestamp after the user has legitimately logged back in.
    await supabaseAdmin.from('users').update({ sessions_revoked_at: null }).eq('id', data.user.id)

    await logSecurityEvent({
      eventType: 'login_success',
      email,
      userId: data.user.id,
      tenantId: profile?.tenant_id,
      request,
    })

    // Password was correct and the account is active -- but that's only
    // aal1. Check whether a second factor still needs completing (or
    // enrolling for the first time) before this counts as fully logged
    // in; middleware.ts enforces this same check on every subsequent
    // request, so this is just what tells the login page where to send
    // the browser next, not the actual enforcement.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      return NextResponse.json({ success: true, mfaStep: 'challenge' })
    }
    if (aal && aal.nextLevel === 'aal1') {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('mfa_required')
        .eq('id', profile?.tenant_id)
        .single()
      if (org?.mfa_required) {
        return NextResponse.json({ success: true, mfaStep: 'enroll' })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error: ' + (err as Error).message }, { status: 500 })
  }
}
