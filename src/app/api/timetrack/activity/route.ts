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

// Called by the desktop agent — authenticated with a per-tenant API key, not a session.
export async function POST(request: Request) {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 })

  const { data: keyRow } = await supabaseAdmin
    .from('agent_api_keys')
    .select('id, tenant_id, user_id, revoked_at')
    .eq('key_hash', hashKey(apiKey))
    .single()

  if (!keyRow || keyRow.revoked_at) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })
  }

  const body = await request.json()
  const events = Array.isArray(body) ? body : [body]

  const rows = events
    .filter((e) => e.window_title || e.process_name)
    .map((e) => ({
      tenant_id: keyRow.tenant_id,
      user_id: keyRow.user_id,
      window_title: e.window_title || null,
      process_name: e.process_name || null,
      duration_seconds: Number(e.duration_seconds) || 0,
      logged_at: e.logged_at || new Date().toISOString(),
    }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No activity events in request body' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('activity_log').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)

  return NextResponse.json({ success: true, inserted: rows.length })
}

// Called by the web app — reviews the current user's tracked activity.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const unconvertedOnly = searchParams.get('unconverted') === '1'

  let query = supabaseAdmin
    .from('activity_log')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)
    .order('logged_at', { ascending: false })
    .limit(200)

  if (unconvertedOnly) query = query.is('converted_to_entry_id', null)

  const { data: activity, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity })
}

// Converts an activity_log row into a time_entries row.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { id, entry } = await request.json()
  if (!id || !entry) return NextResponse.json({ error: 'id and entry are required' }, { status: 400 })

  const { data: activityRow } = await supabaseAdmin
    .from('activity_log')
    .select('id, tenant_id, duration_seconds, logged_at')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!activityRow) return NextResponse.json({ error: 'Activity entry not found' }, { status: 404 })

  const { data: timeEntry, error: insertError } = await supabaseAdmin
    .from('time_entries')
    .insert({
      tenant_id: profile.tenant_id,
      lawyer_id: entry.lawyer_id || null,
      matter_id: entry.matter_id,
      task_code_id: entry.task_code_id || null,
      entry_date: entry.entry_date || activityRow.logged_at.split('T')[0],
      hours: entry.hours || null,
      rate_usd: entry.rate_usd || null,
      amount_usd: entry.amount_usd || null,
      explanation: entry.explanation || null,
      notes: entry.notes || null,
      entry_type: 'timesheet',
      status: 'submitted',
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError || !timeEntry) {
    return NextResponse.json({ error: insertError?.message || 'Failed to create entry' }, { status: 500 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('activity_log')
    .update({ converted_to_entry_id: timeEntry.id })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ entry: timeEntry })
}
