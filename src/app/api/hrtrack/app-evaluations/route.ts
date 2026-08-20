import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RATING_FIELDS = ['accuracy', 'quality', 'citation_accuracy', 'ease_of_use', 'overall_rating']

function computeTimeSavedPct(traditional: number, appTime: number) {
  return Math.round(((traditional - appTime) / traditional) * 100 * 100) / 100
}

// Tenant-wide readable (mirrors performance_evaluations' convention -- the
// UI filters to "my entries" for non-privileged viewers), so the
// Scorecard tab can also fetch a date range across all users to compute
// the auto-fill averages.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const applicationName = searchParams.get('application_name')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabaseAdmin
    .from('app_evaluation_entries')
    .select('*, user:user_id(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('entry_date', { ascending: false })

  if (userId) query = query.eq('user_id', userId)
  if (applicationName) query = query.eq('application_name', applicationName)
  if (from) query = query.gte('entry_date', from)
  if (to) query = query.lte('entry_date', to)

  const { data: entries, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries })
}

// Self-logging: user_id is always the session's own user, never
// client-supplied -- every staff member logs their own daily comparisons.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json()
  const { application_name, practice_area, task, entry_date, traditional_time_minutes, app_time_minutes, material_error, comments } = body

  if (!task || !entry_date) {
    return NextResponse.json({ error: 'task and entry_date are required' }, { status: 400 })
  }
  const traditional = Number(traditional_time_minutes)
  const appTime = Number(app_time_minutes)
  if (!(traditional > 0) || !(appTime >= 0)) {
    return NextResponse.json({ error: 'traditional_time_minutes must be > 0 and app_time_minutes must be >= 0' }, { status: 400 })
  }
  for (const field of RATING_FIELDS) {
    const value = Number(body[field])
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return NextResponse.json({ error: `${field} must be an integer between 1 and 5` }, { status: 400 })
    }
  }

  const { data: entry, error } = await supabaseAdmin
    .from('app_evaluation_entries')
    .insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      application_name: application_name || 'August',
      practice_area: practice_area || null,
      task,
      entry_date,
      traditional_time_minutes: traditional,
      app_time_minutes: appTime,
      time_saved_pct: computeTimeSavedPct(traditional, appTime),
      accuracy: body.accuracy,
      quality: body.quality,
      citation_accuracy: body.citation_accuracy,
      ease_of_use: body.ease_of_use,
      material_error: !!material_error,
      overall_rating: body.overall_rating,
      comments: comments || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry })
}

// Only the entry's own submitter may edit it -- not privileged roles,
// matching what was actually asked for (task-log self-correction, not a
// managerial override).
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('app_evaluation_entries')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of ['application_name', 'practice_area', 'task', 'entry_date', 'comments'] as const) {
    if (body[field] !== undefined) updates[field] = body[field] || null
  }
  for (const field of RATING_FIELDS) {
    if (body[field] !== undefined) {
      const value = Number(body[field])
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        return NextResponse.json({ error: `${field} must be an integer between 1 and 5` }, { status: 400 })
      }
      updates[field] = value
    }
  }
  if (body.material_error !== undefined) updates.material_error = !!body.material_error

  const nextTraditional = body.traditional_time_minutes !== undefined ? Number(body.traditional_time_minutes) : Number(existing.traditional_time_minutes)
  const nextAppTime = body.app_time_minutes !== undefined ? Number(body.app_time_minutes) : Number(existing.app_time_minutes)
  if (body.traditional_time_minutes !== undefined || body.app_time_minutes !== undefined) {
    if (!(nextTraditional > 0) || !(nextAppTime >= 0)) {
      return NextResponse.json({ error: 'traditional_time_minutes must be > 0 and app_time_minutes must be >= 0' }, { status: 400 })
    }
    updates.traditional_time_minutes = nextTraditional
    updates.app_time_minutes = nextAppTime
    updates.time_saved_pct = computeTimeSavedPct(nextTraditional, nextAppTime)
  }

  const { data: entry, error } = await supabaseAdmin
    .from('app_evaluation_entries')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  return NextResponse.json({ entry })
}

export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('app_evaluation_entries')
    .delete()
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
