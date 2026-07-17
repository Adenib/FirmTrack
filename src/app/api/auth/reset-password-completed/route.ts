import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logSecurityEvent } from '@/lib/audit-log'

// The actual password change happens entirely client-side (reset-password
// page calls supabase.auth.updateUser() directly against the recovery
// session established earlier in that flow) -- this route exists only to
// log the completion, called fire-and-forget right after that succeeds.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()

  await logSecurityEvent({
    eventType: 'password_reset_completed',
    email: user.email,
    userId: user.id,
    tenantId: profile?.tenant_id,
    request,
  })

  return NextResponse.json({ success: true })
}
