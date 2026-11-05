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

type PoLineInput = { catalog_item_id?: string | null; description: string; quantity: number; unit_price: number }

// Same count-based scheme as AccountTrack's generateInvoiceNumber --
// PO-{year}-{seq}, no DB sequence.
async function generatePoNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
  return `PO-${year}-${String((count || 0) + 1).padStart(4, '0')}`
}

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
  const id = searchParams.get('id')
  const status = searchParams.get('status')

  if (id) {
    const { data: po } = await supabaseAdmin
      .from('procuretrack_purchase_orders')
      .select('*, vendor:vendor_id(name, email), department:department_id(name), lines:procuretrack_po_lines(*), amendments:procuretrack_po_amendments(*)')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    return NextResponse.json({ po })
  }

  let query = supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('*, vendor:vendor_id(name), department:department_id(name)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data: pos, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ purchaseOrders: pos })
}

// Created directly as 'issued' -- there's no separate draft/submit step
// for v1 (by the time staff raises a PO they mean to send it). From here
// on, substantive changes (lines, amounts, vendor) must go through the
// amendments sub-route -- an issued PO is never edited in place.
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
  const { rfq_id, requisition_id, department_id, currency } = body
  let vendorId: string | undefined = body.vendor_id
  let lines: PoLineInput[] = Array.isArray(body.lines) ? body.lines : []
  let sourceRequisitionId: string | null = requisition_id || null

  if (rfq_id) {
    const { data: rfq } = await supabaseAdmin
      .from('procuretrack_rfqs')
      .select('id, status, requisition_id, requisition:requisition_id(item_description, quantity)')
      .eq('id', rfq_id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!rfq) return NextResponse.json({ error: 'Unknown rfq_id' }, { status: 400 })
    if (rfq.status !== 'awarded') return NextResponse.json({ error: 'RFQ must be awarded before a PO can be raised from it' }, { status: 400 })

    const { data: selectedQuote } = await supabaseAdmin
      .from('procuretrack_rfq_quotes')
      .select('*')
      .eq('rfq_id', rfq_id)
      .eq('is_selected', true)
      .single()
    if (!selectedQuote) return NextResponse.json({ error: 'No selected quote on this RFQ' }, { status: 400 })

    vendorId = selectedQuote.vendor_id
    sourceRequisitionId = rfq.requisition_id
    const req = rfq.requisition as unknown as { item_description: string; quantity: number }
    lines = [{
      description: req?.item_description || 'RFQ item',
      quantity: Number(selectedQuote.quantity),
      unit_price: Number(selectedQuote.unit_price),
    }]
  }

  if (!vendorId) return NextResponse.json({ error: 'vendor_id (or rfq_id) is required' }, { status: 400 })
  if (lines.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
  for (const line of lines) {
    if (!line.description || !Number.isFinite(Number(line.quantity)) || !Number.isFinite(Number(line.unit_price))) {
      return NextResponse.json({ error: 'Each line needs description, quantity, and unit_price' }, { status: 400 })
    }
  }

  if (sourceRequisitionId) {
    const { data: requisition } = await supabaseAdmin
      .from('procuretrack_requisitions')
      .select('id, status')
      .eq('id', sourceRequisitionId)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!requisition) return NextResponse.json({ error: 'Unknown requisition_id' }, { status: 400 })
    if (!['approved', 'converted_to_rfq'].includes(requisition.status)) {
      return NextResponse.json({ error: 'Requisition must be approved before a PO can be raised from it' }, { status: 400 })
    }
  }

  const totalAmount = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0)
  const poNumber = await generatePoNumber(profile.tenant_id)

  const { data: po, error } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .insert({
      tenant_id: profile.tenant_id,
      po_number: poNumber,
      requisition_id: sourceRequisitionId,
      vendor_id: vendorId,
      department_id: department_id || null,
      status: 'issued',
      currency: currency || 'NGN',
      total_amount: Math.round(totalAmount * 100) / 100,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabaseAdmin.from('procuretrack_po_lines').insert(
    lines.map((l) => ({
      tenant_id: profile.tenant_id,
      po_id: po.id,
      catalog_item_id: l.catalog_item_id || null,
      description: l.description,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      line_total: Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100,
    }))
  )

  if (sourceRequisitionId) {
    await supabaseAdmin
      .from('procuretrack_requisitions')
      .update({ status: 'converted_to_po', updated_at: new Date().toISOString() })
      .eq('id', sourceRequisitionId)
  }

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'po', documentId: po.id,
    userId: user.id, eventType: 'issued', metadata: { po_number: poNumber, total_amount: po.total_amount },
  })

  return NextResponse.json({ po }, { status: 201 })
}

// The only lifecycle change allowed outside the amendments sub-route --
// cancelling a PO that hasn't been received against yet. Every other
// change to an issued PO (amounts, vendor, lines) must go through
// amendments.
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
  if (!id || body.status !== 'cancelled') {
    return NextResponse.json({ error: 'id is required and status must be "cancelled"' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  if (!['issued'].includes(existing.status)) {
    return NextResponse.json({ error: 'Only an issued PO with nothing received against it can be cancelled' }, { status: 400 })
  }

  const { data: po, error } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'po', documentId: id, userId: user.id, eventType: 'cancelled',
  })

  return NextResponse.json({ po })
}
