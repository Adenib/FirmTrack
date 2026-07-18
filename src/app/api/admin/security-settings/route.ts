import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireOwnerOrAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { profile }
}

export async function GET() {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('mfa_required')
    .eq('id', profile!.tenant_id)
    .single()
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })

  return NextResponse.json({ settings: { mfa_required: org.mfa_required } })
}

// Groundwork for Stage 5 (Microsoft/Google SSO) -- a tenant whose IdP
// already enforces MFA via Conditional Access will be able to turn this
// requirement off; everyone else keeps it on by default.
export async function PUT(request: Request) {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  const { mfa_required } = await request.json()
  if (typeof mfa_required !== 'boolean') {
    return NextResponse.json({ error: 'mfa_required must be a boolean' }, { status: 400 })
  }

  const { data: org, error: updateError } = await supabaseAdmin
    .from('organizations')
    .update({ mfa_required })
    .eq('id', profile!.tenant_id)
    .select('mfa_required')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ settings: { mfa_required: org.mfa_required } })
}
