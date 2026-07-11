import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function hashKey(rawKey: string) {
  return crypto.createHash('sha256').update(rawKey).digest('hex')
}

// Each lawyer generates and owns their own key so activity attributes to
// them individually; owners/admins can additionally see every key on the tenant.
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  let query = supabaseAdmin
    .from('agent_api_keys')
    .select('id, user_id, label, key_prefix, created_at, last_used_at, revoked_at')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (!['owner', 'admin'].includes(profile.role)) {
    query = query.eq('user_id', user.id)
  }

  const { data: keys, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ keys })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { label } = await request.json().catch(() => ({ label: null }))

  const rawKey = `ftk_${crypto.randomBytes(24).toString('hex')}`
  const keyPrefix = rawKey.slice(0, 10)

  const { data: key, error } = await supabaseAdmin
    .from('agent_api_keys')
    .insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      label: label || null,
      key_prefix: keyPrefix,
      key_hash: hashKey(rawKey),
    })
    .select('id, label, key_prefix, created_at')
    .single()

  if (error || !key) {
    return NextResponse.json({ error: error?.message || 'Failed to create key' }, { status: 500 })
  }

  // rawKey is only ever returned here — it is not recoverable afterwards.
  return NextResponse.json({ key: { ...key, raw_key: rawKey } })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  let query = supabaseAdmin
    .from('agent_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)

  if (!['owner', 'admin'].includes(profile.role)) {
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query.select('id, label, key_prefix, revoked_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ key: data })
}
