import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logSecurityEvent } from '@/lib/audit-log'

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
