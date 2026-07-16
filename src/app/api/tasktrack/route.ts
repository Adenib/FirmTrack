import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No profile found' }, { status: 403 })
  }

  const { title, description, priority, due_date, assigned_to } = await request.json()

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      tenant_id: profile.tenant_id,
      created_by: user.id,
      assigned_to: assigned_to || null,
      title,
      description: description || null,
      priority: priority || 'medium',
      due_date: due_date || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task })
}

// Approving a task out of "review" (marking it done) is treated as a
// manager-level action, not a self-serve status change — every other
// transition (open/in_progress/review/cancelled) stays open to anyone in
// the tenant, matching this route's existing lenient convention.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No profile found' }, { status: 403 })
  }

  const { id, status } = await request.json()

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
  }

  if (status === 'done') {
    const { data: existing } = await supabaseAdmin
      .from('tasks')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (existing?.status === 'review' && !['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only owner, admin, or manager can approve a task out of review' }, { status: 403 })
    }
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task })
}
