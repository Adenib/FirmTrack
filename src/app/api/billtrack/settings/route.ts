import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function maskKey(key: string | null): string | null {
  if (!key) return null
  if (key.length <= 4) return '****'
  return `${'*'.repeat(Math.max(0, key.length - 4))}${key.slice(-4)}`
}

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

// Returns the tenant's BillTrack settings, creating a default row on first
// visit (reminder_cadence_days defaults to 7 at the DB level). The real
// custom_resend_api_key is never sent to the browser — only a masked
// preview (e.g. "****abcd") — so a GET immediately followed by a PUT can't
// leak it, and the settings page can only ever set a new key, not read
// the old one back.
export async function GET() {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  if (!(await hasActiveModule(profile!.tenant_id, 'billtrack'))) {
    return NextResponse.json({ error: 'BillTrack is not active for this tenant' }, { status: 403 })
  }

  let { data: settings } = await supabaseAdmin
    .from('billtrack_settings')
    .select('*')
    .eq('tenant_id', profile!.tenant_id)
    .maybeSingle()

  if (!settings) {
    const { data: created, error: insertError } = await supabaseAdmin
      .from('billtrack_settings')
      .insert({ tenant_id: profile!.tenant_id })
      .select()
      .single()
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    settings = created
  }

  return NextResponse.json({
    settings: {
      reminder_cadence_days: settings.reminder_cadence_days,
      custom_from_email: settings.custom_from_email,
      custom_from_name: settings.custom_from_name,
      custom_resend_api_key_masked: maskKey(settings.custom_resend_api_key),
    },
  })
}

// Partial update: a field is only changed if present (and non-empty for
// the API key) in the request body — omitting custom_resend_api_key
// leaves whatever key is already stored untouched, so the settings page
// never has to round-trip the real secret to let the admin edit other
// fields.
export async function PUT(request: Request) {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  if (!(await hasActiveModule(profile!.tenant_id, 'billtrack'))) {
    return NextResponse.json({ error: 'BillTrack is not active for this tenant' }, { status: 403 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.reminder_cadence_days === 'number' && body.reminder_cadence_days > 0) {
    updates.reminder_cadence_days = body.reminder_cadence_days
  }
  if (typeof body.custom_from_email === 'string') {
    updates.custom_from_email = body.custom_from_email || null
  }
  if (typeof body.custom_from_name === 'string') {
    updates.custom_from_name = body.custom_from_name || null
  }
  if (typeof body.custom_resend_api_key === 'string' && body.custom_resend_api_key.trim()) {
    updates.custom_resend_api_key = body.custom_resend_api_key.trim()
  }

  const { data: existing } = await supabaseAdmin
    .from('billtrack_settings')
    .select('tenant_id')
    .eq('tenant_id', profile!.tenant_id)
    .maybeSingle()

  const { data, error: writeError } = existing
    ? await supabaseAdmin
        .from('billtrack_settings')
        .update(updates)
        .eq('tenant_id', profile!.tenant_id)
        .select()
        .single()
    : await supabaseAdmin
        .from('billtrack_settings')
        .insert({ tenant_id: profile!.tenant_id, ...updates })
        .select()
        .single()

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

  return NextResponse.json({
    settings: {
      reminder_cadence_days: data.reminder_cadence_days,
      custom_from_email: data.custom_from_email,
      custom_from_name: data.custom_from_name,
      custom_resend_api_key_masked: maskKey(data.custom_resend_api_key),
    },
  })
}
