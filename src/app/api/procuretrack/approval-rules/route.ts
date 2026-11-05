import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

function validSequence(seq: unknown): seq is { role: string }[] {
  return Array.isArray(seq) && seq.length > 0 && seq.every((s) => s && typeof s.role === 'string' && s.role.trim())
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }

  const { data: rules, error } = await supabaseAdmin
    .from('procuretrack_approval_rules')
    .select('*, department:department_id(name)')
    .eq('tenant_id', profile.tenant_id)
    .order('min_amount', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rules })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin access required' }, { status: 403 })
  }

  const body = await request.json()
  if (!validSequence(body.approver_sequence)) {
    return NextResponse.json({ error: 'approver_sequence must be a non-empty array of { role } steps' }, { status: 400 })
  }
  const minAmount = Number(body.min_amount ?? 0)
  if (!Number.isFinite(minAmount) || minAmount < 0) {
    return NextResponse.json({ error: 'min_amount must be a non-negative number' }, { status: 400 })
  }

  const { data: rule, error } = await supabaseAdmin
    .from('procuretrack_approval_rules')
    .insert({
      tenant_id: profile.tenant_id,
      min_amount: minAmount,
      max_amount: body.max_amount != null && body.max_amount !== '' ? Number(body.max_amount) : null,
      department_id: body.department_id || null,
      approver_sequence: body.approver_sequence,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ rule }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('min_amount' in body) patch.min_amount = Number(body.min_amount)
  if ('max_amount' in body) patch.max_amount = body.max_amount != null && body.max_amount !== '' ? Number(body.max_amount) : null
  if ('department_id' in body) patch.department_id = body.department_id || null
  if ('approver_sequence' in body) {
    if (!validSequence(body.approver_sequence)) {
      return NextResponse.json({ error: 'approver_sequence must be a non-empty array of { role } steps' }, { status: 400 })
    }
    patch.approver_sequence = body.approver_sequence
  }

  const { data: rule, error } = await supabaseAdmin
    .from('procuretrack_approval_rules')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

  return NextResponse.json({ rule })
}
