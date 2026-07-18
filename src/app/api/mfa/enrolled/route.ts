import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logSecurityEvent } from '@/lib/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The actual TOTP enrollment happens entirely client-side (the /mfa/enroll
// page calls supabase.auth.mfa.enroll/challengeAndVerify directly) -- this
// route exists to log the completion (fire-and-forget, mirroring
// reset-password-completed) and to prune any stray *unverified* factors
// left behind by earlier, abandoned enrollment attempts -- each attempt
// uses a unique friendly name (see /mfa/enroll) precisely so it can't
// collide with those leftovers, but they'd otherwise accumulate forever.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()

  const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: user.id })
  for (const factor of factors?.factors || []) {
    if (factor.status !== 'verified') {
      await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id })
    }
  }

  await logSecurityEvent({
    eventType: 'mfa_enrolled',
    email: user.email,
    userId: user.id,
    tenantId: profile?.tenant_id,
    request,
  })

  return NextResponse.json({ success: true })
}
