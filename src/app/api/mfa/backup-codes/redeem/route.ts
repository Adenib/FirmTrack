import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { logSecurityEvent } from '@/lib/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

// Called from /mfa/challenge by a caller still at aal1 (that's the whole
// point of a backup code) -- so the factor removal below has to go through
// the admin API rather than their own unenroll(), which requires aal2.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const { data: match } = await supabaseAdmin
    .from('mfa_backup_codes')
    .select('id')
    .eq('user_id', user.id)
    .eq('code_hash', hashCode(code))
    .is('used_at', null)
    .maybeSingle()

  if (!match) {
    return NextResponse.json({ error: 'Invalid or already-used backup code' }, { status: 400 })
  }

  await supabaseAdmin.from('mfa_backup_codes').update({ used_at: new Date().toISOString() }).eq('id', match.id)

  const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: user.id })
  for (const factor of factors?.factors || []) {
    await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id })
  }

  await logSecurityEvent({
    eventType: 'mfa_reset',
    email: user.email,
    userId: user.id,
    tenantId: profile.tenant_id,
    request,
    metadata: { method: 'backup_code' },
  })

  return NextResponse.json({ success: true })
}
