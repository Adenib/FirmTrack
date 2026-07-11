import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called by the TimeTrack calendar-event picker to find events to link a
// time entry to. Not the only reader of ft_calendar_events — the CalenTrack
// page itself still reads directly via the Supabase client — this GET is
// specifically for that cross-module lookup, so it joins matter context.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabaseAdmin
    .from('ft_calendar_events')
    .select(`
      id, title, description, event_type, start_at, end_at, all_day, status,
      linked_module, linked_id
    `)
    .eq('tenant_id', profile.tenant_id)
    .order('start_at', { ascending: false })
    .limit(50)

  if (q) query = query.ilike('title', `%${q}%`)
  if (from) query = query.gte('start_at', from)
  if (to) query = query.lte('start_at', to)

  const { data: events, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // linked_module/linked_id is generic — resolve the matter context for
  // events linked to a matter so the picker can show it, without a join
  // PostgREST can express for a polymorphic FK.
  const matterIds = [...new Set(
    (events || []).filter((e) => e.linked_module === 'matters' && e.linked_id).map((e) => e.linked_id)
  )]

  let mattersById: Record<string, unknown> = {}
  if (matterIds.length > 0) {
    const { data: matters } = await supabaseAdmin
      .from('matters')
      .select('id, matter_id, case_name')
      .in('id', matterIds)
    mattersById = Object.fromEntries((matters || []).map((m) => [m.id, m]))
  }

  const enriched = (events || []).map((e) => ({
    ...e,
    matter: e.linked_module === 'matters' ? mattersById[e.linked_id] || null : null,
  }))

  return NextResponse.json({ events: enriched })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { title, description, event_type, start_at, end_at, all_day, assigned_to, matter_id } = await request.json()

  if (!title || !start_at || !end_at) {
    return NextResponse.json({ error: 'title, start_at and end_at are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ft_calendar_events')
    .insert({
      tenant_id: profile.tenant_id,
      created_by: user.id,
      assigned_to: assigned_to || null,
      title,
      description: description || null,
      event_type: event_type || 'meeting',
      start_at,
      end_at,
      all_day: all_day || false,
      status: 'scheduled',
      linked_module: matter_id ? 'matters' : null,
      linked_id: matter_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('ft_calendar_events')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}