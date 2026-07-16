import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tenant-wide readable (staff can see their own evaluations mixed in with
// everyone else's in the raw list — the UI is responsible for filtering
// to "my evaluations" for non-privileged viewers), but only owner/admin/
// manager can write one, matching the same privileged-role convention
// used for approving a task out of review.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const staffUserId = searchParams.get('staff_user_id')

  let query = supabaseAdmin
    .from('performance_evaluations')
    .select('*, staff:staff_user_id(email), reviewer:reviewer_user_id(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (staffUserId) query = query.eq('staff_user_id', staffUserId)

  const { data: evaluations, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evaluations })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { staff_user_id, period, rating, comments } = await request.json()
  if (!staff_user_id || !rating) {
    return NextResponse.json({ error: 'staff_user_id and rating are required' }, { status: 400 })
  }
  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be between 1 and 5' }, { status: 400 })
  }

  const { data: evaluation, error } = await supabaseAdmin
    .from('performance_evaluations')
    .insert({
      tenant_id: profile.tenant_id,
      staff_user_id,
      reviewer_user_id: user.id,
      period: period || null,
      rating,
      comments: comments || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evaluation })
}
