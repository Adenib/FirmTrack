import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateCode(): string {
  // 5 random bytes -> 10 hex chars, grouped for readability. High-entropy
  // random tokens, not human-chosen secrets, so a fast hash (below) is fine
  // -- these don't need bcrypt's deliberate slowness.
  const hex = randomBytes(5).toString('hex').toUpperCase()
  return `${hex.slice(0, 5)}-${hex.slice(5)}`
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

// Owner/admin only, per the recovery-model split -- everyone else relies
// on an admin-assisted reset instead of self-service backup codes.
// Called by the /mfa/enroll page immediately after a successful TOTP
// verification for an owner/admin; regenerating (calling this again
// later) replaces any previously issued codes.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  await supabaseAdmin.from('mfa_backup_codes').delete().eq('user_id', user.id)

  const codes = Array.from({ length: 8 }, generateCode)
  const { error } = await supabaseAdmin.from('mfa_backup_codes').insert(
    codes.map((code) => ({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      code_hash: hashCode(code),
    }))
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Plaintext codes are returned exactly once -- only the hash is ever
  // stored, so there's no way to recover them again after this response.
  return NextResponse.json({ codes })
}
