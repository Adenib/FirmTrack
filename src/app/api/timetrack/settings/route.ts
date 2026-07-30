import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAuthenticated() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return { error: NextResponse.json({ error: 'No profile' }, { status: 403 }) }
  return { profile }
}

async function requireOwnerOrAdmin() {
  const { error, profile } = await requireAuthenticated()
  if (error) return { error }
  if (!['owner', 'admin'].includes(profile!.role)) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { profile }
}

// Read is open to any tenant member -- the TimeTrack page needs to
// know whether to show the "Draft with AI" button regardless of role.
// Only changing the firm-wide switch (PUT) is owner/admin-only.
export async function GET() {
  const { error, profile } = await requireAuthenticated()
  if (error) return error

  const { data: settings } = await supabaseAdmin
    .from('timetrack_settings')
    .select('*')
    .eq('tenant_id', profile!.tenant_id)
    .maybeSingle()

  return NextResponse.json({ settings: { ai_drafting_enabled: settings?.ai_drafting_enabled ?? false } })
}

export async function PUT(request: Request) {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  const { ai_drafting_enabled } = await request.json()
  if (typeof ai_drafting_enabled !== 'boolean') {
    return NextResponse.json({ error: 'ai_drafting_enabled must be a boolean' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('timetrack_settings')
    .select('tenant_id')
    .eq('tenant_id', profile!.tenant_id)
    .maybeSingle()

  const { data, error: writeError } = existing
    ? await supabaseAdmin
        .from('timetrack_settings')
        .update({ ai_drafting_enabled, updated_at: new Date().toISOString() })
        .eq('tenant_id', profile!.tenant_id)
        .select()
        .single()
    : await supabaseAdmin
        .from('timetrack_settings')
        .insert({ tenant_id: profile!.tenant_id, ai_drafting_enabled })
        .select()
        .single()

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })
  return NextResponse.json({ settings: { ai_drafting_enabled: data.ai_drafting_enabled } })
}
