import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'
import { logProcuretrackEvent } from '@/lib/procuretrack/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VENDOR_STATUSES = ['active', 'pending_approval', 'blacklisted']
const EDITABLE_FIELDS = [
  'name', 'category', 'email', 'phone', 'address', 'tax_id',
  'bank_name', 'bank_account_number', 'bank_account_name', 'status', 'notes',
] as const

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// 'vendors' is shared between AssetTrack and ProcureTrack -- a tenant with
// either module active can read/manage the registry.
async function hasVendorAccess(tenantId: string): Promise<boolean> {
  return (await hasActiveModule(tenantId, 'procuretrack')) || (await hasActiveModule(tenantId, 'assettrack'))
}

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasVendorAccess(profile.tenant_id))) {
    return NextResponse.json({ error: 'ProcureTrack/AssetTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('vendors')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('name', { ascending: true })
  if (status) query = query.eq('status', status)

  const { data: vendors, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ vendors })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasVendorAccess(profile.tenant_id))) {
    return NextResponse.json({ error: 'ProcureTrack/AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!PROCURETRACK_APPROVER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager access required' }, { status: 403 })
  }

  const body = await request.json()
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (body.status && !VENDOR_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const insert: Record<string, unknown> = { tenant_id: profile.tenant_id, created_by: user.id, name: body.name.trim() }
  for (const field of EDITABLE_FIELDS) {
    if (field === 'name') continue
    if (field in body) insert[field] = body[field]
  }

  const { data: vendor, error } = await supabaseAdmin.from('vendors').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'vendor', documentId: vendor.id,
    userId: user.id, eventType: 'created',
  })

  return NextResponse.json({ vendor }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasVendorAccess(profile.tenant_id))) {
    return NextResponse.json({ error: 'ProcureTrack/AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!PROCURETRACK_APPROVER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager access required' }, { status: 403 })
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
  if ('status' in patch && !VENDOR_STATUSES.includes(String(patch.status))) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const { data: vendor, error } = await supabaseAdmin
    .from('vendors')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'vendor', documentId: vendor.id,
    userId: user.id, eventType: 'updated', metadata: { changed_fields: Object.keys(patch) },
  })

  return NextResponse.json({ vendor })
}
