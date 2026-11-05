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

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const requisitionId = searchParams.get('requisition_id')

  let query = supabaseAdmin
    .from('procuretrack_rfqs')
    .select('*, requisition:requisition_id(item_description), invited_vendors:procuretrack_rfq_vendors(vendor_id, vendor:vendor_id(name)), quotes:procuretrack_rfq_quotes(*, vendor:vendor_id(name))')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
  if (requisitionId) query = query.eq('requisition_id', requisitionId)

  const { data: rfqs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rfqs })
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
  const { requisition_id, title, vendor_ids } = body
  if (!requisition_id || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'requisition_id and title are required' }, { status: 400 })
  }

  const { data: requisition } = await supabaseAdmin
    .from('procuretrack_requisitions')
    .select('id, status')
    .eq('id', requisition_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!requisition) return NextResponse.json({ error: 'Unknown requisition_id' }, { status: 400 })
  if (requisition.status !== 'approved') {
    return NextResponse.json({ error: 'An RFQ can only be created from an approved requisition' }, { status: 400 })
  }

  const { data: rfq, error } = await supabaseAdmin
    .from('procuretrack_rfqs')
    .insert({ tenant_id: profile.tenant_id, requisition_id, title: title.trim(), created_by: user.id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (Array.isArray(vendor_ids) && vendor_ids.length > 0) {
    await supabaseAdmin.from('procuretrack_rfq_vendors').insert(
      vendor_ids.map((vendorId: string) => ({ tenant_id: profile.tenant_id, rfq_id: rfq.id, vendor_id: vendorId }))
    )
  }

  await supabaseAdmin
    .from('procuretrack_requisitions')
    .update({ status: 'converted_to_rfq', updated_at: new Date().toISOString() })
    .eq('id', requisition_id)

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'requisition', documentId: requisition_id,
    userId: user.id, eventType: 'rfq_created', metadata: { rfq_id: rfq.id },
  })

  return NextResponse.json({ rfq }, { status: 201 })
}
