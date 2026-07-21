import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

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

  if (!(await hasActiveModule(profile!.tenant_id, 'doctrack'))) {
    return NextResponse.json({ error: 'DocTrack is not active for this tenant' }, { status: 403 })
  }

  const { data: settings } = await supabaseAdmin
    .from('doctrack_settings')
    .select('*')
    .eq('tenant_id', profile!.tenant_id)
    .maybeSingle()

  return NextResponse.json({ settings: { retention_days: settings?.retention_days ?? null } })
}

export async function PUT(request: Request) {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  if (!(await hasActiveModule(profile!.tenant_id, 'doctrack'))) {
    return NextResponse.json({ error: 'DocTrack is not active for this tenant' }, { status: 403 })
  }

  const { retention_days } = await request.json()
  if (retention_days !== null && (typeof retention_days !== 'number' || retention_days <= 0)) {
    return NextResponse.json({ error: 'retention_days must be a positive number or null' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('doctrack_settings')
    .select('tenant_id')
    .eq('tenant_id', profile!.tenant_id)
    .maybeSingle()

  const { data, error: writeError } = existing
    ? await supabaseAdmin
        .from('doctrack_settings')
        .update({ retention_days, updated_at: new Date().toISOString() })
        .eq('tenant_id', profile!.tenant_id)
        .select()
        .single()
    : await supabaseAdmin
        .from('doctrack_settings')
        .insert({ tenant_id: profile!.tenant_id, retention_days })
        .select()
        .single()

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })
  return NextResponse.json({ settings: { retention_days: data.retention_days } })
}
