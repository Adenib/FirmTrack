import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logSecurityEvent } from '@/lib/audit-log'

export async function GET(request: Request) {
  const supabase = await createClient()

  // Read who's signing out before the session is destroyed.
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    await logSecurityEvent({
      eventType: 'logout',
      email: user.email,
      userId: user.id,
      tenantId: profile?.tenant_id,
      request,
    })
  }

  await supabase.auth.signOut()
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/login`)
}
