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
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const supabase = await createServerClient()
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

    // Supabase never reveals whether the email is registered (returns
    // success either way) — preserved here rather than swallowed, so the
    // frontend can't be used to enumerate accounts by checking a status code.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    })

    // Resolving tenant_id/user_id here (an internal lookup, never exposed
    // in the response) is what lets this event show up in that tenant's
    // admin-only Security Log viewer -- without it, every reset request
    // would be logged with a null tenant_id and be invisible to any admin.
    const { data: maybeProfile } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id')
      .eq('email', email)
      .maybeSingle()

    await logSecurityEvent({
      eventType: 'password_reset_requested',
      email,
      userId: maybeProfile?.id,
      tenantId: maybeProfile?.tenant_id,
      request,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error: ' + (err as Error).message }, { status: 500 })
  }
}
