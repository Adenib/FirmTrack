import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logSecurityEvent } from '@/lib/audit-log'

export async function GET(request: Request) {
  const supabase = await createClient()

  // Read who's signing out before the session is destroyed.
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    // See the matching comment in api/auth/login/route.ts -- platform
    // admins have no public.users row, so user_id must be omitted for
    // them or the FK-constrained insert silently fails.
    await logSecurityEvent({
      eventType: 'logout',
      email: user.email,
      userId: profile ? user.id : null,
      tenantId: profile?.tenant_id,
      request,
      metadata: profile ? undefined : { accountType: 'platform_admin' },
    })
  }

  await supabase.auth.signOut()
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/login`)
}
