import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { isSignupGatePaused, setSignupGatePaused } from '@/lib/signup-gate'
import { logSecurityEvent } from '@/lib/audit-log'

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
  return { admin, user }
}

export async function GET() {
  const auth = await requirePrivilegedCreator()
  if (auth.error) return auth.error

  return NextResponse.json({ paused: await isSignupGatePaused() })
}

// Pauses/resumes the new-signup approval gate for all future
// registrations. Does not touch orgs already sitting in the pending
// queue -- see src/app/api/register/route.ts for what actually reads
// this flag.
export async function PATCH(request: Request) {
  const auth = await requirePrivilegedCreator()
  if (auth.error) return auth.error

  const { paused } = await request.json()
  if (typeof paused !== 'boolean') {
    return NextResponse.json({ error: 'paused (boolean) is required' }, { status: 400 })
  }

  await setSignupGatePaused(paused)

  // No userId here -- the actor is a platform admin (platform_admins),
  // which has no row in public.users, and security_audit_log.user_id is
  // FK'd to that table. email is a free-text column, so it still
  // identifies who made the change.
  await logSecurityEvent({
    eventType: paused ? 'signup_gate_paused' : 'signup_gate_resumed',
    email: auth.user!.email ?? null,
    request,
    metadata: { platformAdminRole: auth.admin!.role },
  })

  return NextResponse.json({ paused })
}
