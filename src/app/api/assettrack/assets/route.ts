import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { ASSETTRACK_STAFF_ROLES } from '@/lib/assettrack/roles'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ASSET_STATUSES = ['active', 'in_repair', 'loaned', 'retired']
const EDITABLE_FIELDS = [
  'asset_tag', 'serial_number', 'make', 'model', 'assigned_to',
  'purchase_date', 'warranty_end_date', 'replacement_cost', 'asset_status',
] as const

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('assettrack_assets')
    .select('*, assignee:assigned_to(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('asset_tag', { ascending: true })

  if (status) query = query.eq('asset_status', status)

  const { data: assets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const isStaff = ASSETTRACK_STAFF_ROLES.includes(profile.role)
  const visible = isStaff
    ? assets
    : (assets || []).map((a) => {
        const copy = { ...a }
        delete copy.replacement_cost
        return copy
      })

  return NextResponse.json({ assets: visible, isStaff })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!ASSETTRACK_STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'IT staff access required' }, { status: 403 })
  }

  const body = await request.json()
  if (typeof body.asset_tag !== 'string' || !body.asset_tag.trim()) {
    return NextResponse.json({ error: 'asset_tag is required' }, { status: 400 })
  }

  const insert: Record<string, unknown> = { tenant_id: profile.tenant_id, created_by: user.id, asset_tag: body.asset_tag.trim() }
  for (const field of EDITABLE_FIELDS) {
    if (field === 'asset_tag') continue
    if (field in body) insert[field] = body[field]
  }
  if ('asset_status' in insert && !ASSET_STATUSES.includes(String(insert.asset_status))) {
    return NextResponse.json({ error: 'Invalid asset_status' }, { status: 400 })
  }

  const { data: asset, error } = await supabaseAdmin.from('assettrack_assets').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ asset }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!ASSETTRACK_STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'IT staff access required' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No supported fields supplied' }, { status: 400 })
  }
  if ('asset_status' in patch && !ASSET_STATUSES.includes(String(patch.asset_status))) {
    return NextResponse.json({ error: 'Invalid asset_status' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const { data: asset, error } = await supabaseAdmin
    .from('assettrack_assets')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  return NextResponse.json({ asset })
}
