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

    await logSecurityEvent({
      eventType: 'login_success',
      email,
      userId: data.user.id,
      tenantId: profile?.tenant_id,
      request,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error: ' + (err as Error).message }, { status: 500 })
  }
}
