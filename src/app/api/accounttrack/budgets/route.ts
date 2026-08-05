import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const lawyerId = searchParams.get('lawyer_id')
  const matterId = searchParams.get('matter_id')

  let query = supabaseAdmin
    .from('budgets')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('period_start', { ascending: false })

  if (lawyerId) query = query.eq('lawyer_id', lawyerId)
  if (matterId) query = query.eq('matter_id', matterId)

  const { data: budgets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ budgets })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const {
    lawyer_id, matter_id, period_start, period_end,
    target_hours, target_billable_hours, target_revenue, notes,
  } = await request.json()

  if (!!lawyer_id === !!matter_id) {
    return NextResponse.json({ error: 'Exactly one of lawyer_id or matter_id is required' }, { status: 400 })
  }
  if (!period_start || !period_end) {
    return NextResponse.json({ error: 'period_start and period_end are required' }, { status: 400 })
  }

  const { data: budget, error } = await supabaseAdmin
    .from('budgets')
    .insert({
      tenant_id: profile.tenant_id,
      lawyer_id: lawyer_id || null,
      matter_id: matter_id || null,
      period_start,
      period_end,
      target_hours: target_hours || null,
      target_billable_hours: target_billable_hours || null,
      target_revenue: target_revenue || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ budget })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { id, target_hours, target_billable_hours, target_revenue, notes } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (target_hours !== undefined) updates.target_hours = target_hours
  if (target_billable_hours !== undefined) updates.target_billable_hours = target_billable_hours
  if (target_revenue !== undefined) updates.target_revenue = target_revenue
  if (notes !== undefined) updates.notes = notes

  const { data: budget, error } = await supabaseAdmin
    .from('budgets')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ budget })
}
