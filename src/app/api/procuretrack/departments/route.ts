import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
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

  const { data: departments, error } = await supabaseAdmin
    .from('departments')
    .select('*, manager:manager_id(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ departments })
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
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: department, error } = await supabaseAdmin
    .from('departments')
    .insert({
      tenant_id: profile.tenant_id,
      name: body.name.trim(),
      cost_center_code: body.cost_center_code || null,
      manager_id: body.manager_id || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ department }, { status: 201 })
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
  for (const field of ['name', 'cost_center_code', 'manager_id'] as const) {
    if (field in body) patch[field] = body[field]
  }

  const { data: department, error } = await supabaseAdmin
    .from('departments')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!department) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

  return NextResponse.json({ department })
}
