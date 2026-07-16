import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { detectAttendanceStatus } from '@/lib/hrtrack/distance'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tenant-wide visible to any authenticated tenant member, matching
// MovementTrack/TaskTrack's existing lack of per-viewer restriction —
// Attendance doesn't invent a new visibility model.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const userId = searchParams.get('user_id')

  let query = supabaseAdmin
    .from('attendance_records')
    .select('*, users(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('clock_in_at', { ascending: false })

  if (from) query = query.gte('clock_in_at', from)
  if (to) query = query.lte('clock_in_at', to + 'T23:59:59')
  if (userId) query = query.eq('user_id', userId)

  const { data: records, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records })
}

// Clock in. Office-vs-remote is determined server-side from the submitted
// coordinates against the tenant's configured office_locations — not
// trusted from the client, so a person can't just claim "office" from
// home. Blocks a second concurrent clock-in for the same user.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { lat, lng, location, note } = await request.json()
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const { data: openRecord } = await supabaseAdmin
    .from('attendance_records')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)
    .is('clock_out_at', null)
    .maybeSingle()

  if (openRecord) {
    return NextResponse.json({ error: 'Already clocked in — clock out first' }, { status: 400 })
  }

  const { data: offices } = await supabaseAdmin
    .from('office_locations')
    .select('latitude, longitude, radius_meters')
    .eq('tenant_id', profile.tenant_id)

  const status = detectAttendanceStatus(lat, lng, offices || [])
  if (status === 'remote' && !note) {
    return NextResponse.json({ error: 'A note is required when clocking in remotely' }, { status: 400 })
  }

  const { data: record, error } = await supabaseAdmin
    .from('attendance_records')
    .insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      clock_in_lat: lat,
      clock_in_lng: lng,
      clock_in_location: location || null,
      status,
      note: note || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record })
}

// Clock out — closes the caller's own open record, found automatically
// rather than requiring the client to track/pass an id.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { lat, lng, location } = await request.json()

  const { data: openRecord } = await supabaseAdmin
    .from('attendance_records')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)
    .is('clock_out_at', null)
    .maybeSingle()

  if (!openRecord) {
    return NextResponse.json({ error: 'No open clock-in found to close' }, { status: 400 })
  }

  const { data: record, error } = await supabaseAdmin
    .from('attendance_records')
    .update({
      clock_out_at: new Date().toISOString(),
      clock_out_lat: typeof lat === 'number' ? lat : null,
      clock_out_lng: typeof lng === 'number' ? lng : null,
      clock_out_location: location || null,
    })
    .eq('id', openRecord.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record })
}
