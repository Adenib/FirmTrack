import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EDITABLE_FIELDS = ['title', 'contract_number', 'vendor_id', 'start_date', 'end_date', 'status', 'document_path'] as const

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

  const { data: contracts, error } = await supabaseAdmin
    .from('procuretrack_contracts')
    .select('*, vendor:vendor_id(name)')
    .eq('tenant_id', profile.tenant_id)
    .order('end_date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ contracts })
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
  if (!PROCURETRACK_APPROVER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager access required' }, { status: 403 })
  }

  const body = await request.json()
  if (typeof body.title !== 'string' || !body.title.trim() || !body.vendor_id) {
    return NextResponse.json({ error: 'title and vendor_id are required' }, { status: 400 })
  }

  const insert: Record<string, unknown> = { tenant_id: profile.tenant_id, created_by: user.id, title: body.title.trim() }
  for (const field of EDITABLE_FIELDS) {
    if (field === 'title') continue
    if (field in body) insert[field] = body[field]
  }

  const { data: contract, error } = await supabaseAdmin.from('procuretrack_contracts').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ contract }, { status: 201 })
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
  if (!PROCURETRACK_APPROVER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager access required' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }

  const { data: contract, error } = await supabaseAdmin
    .from('procuretrack_contracts')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })

  return NextResponse.json({ contract })
}
