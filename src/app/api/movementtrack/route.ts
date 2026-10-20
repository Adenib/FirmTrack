import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Same privileged set HRTrack's own requests/evaluations routes use.
const REVIEW_PRIVILEGED = ['owner', 'admin', 'manager', 'hr']

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { location_from, location_to, purpose } = await request.json()
  if (!location_to) return NextResponse.json({ error: 'Destination is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('movements')
    .insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      location_from: location_from || null,
      location_to,
      purpose: purpose || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ movement: data })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!REVIEW_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized to update movement status' }, { status: 403 })
  }

  const { id, ids, status } = await request.json()
  if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 })

  // Accepts a single id (back-compat) or ids[] (bulk approve/reject) --
  // same update, applied to however many rows were asked for.
  const targetIds: string[] = Array.isArray(ids) ? ids : id ? [id] : []
  if (targetIds.length === 0) return NextResponse.json({ error: 'id or ids is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('movements')
    .update({ status })
    .in('id', targetIds)
    .eq('tenant_id', profile.tenant_id)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ movements: data })
}