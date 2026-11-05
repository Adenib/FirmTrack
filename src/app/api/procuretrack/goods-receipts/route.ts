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

type GrnLineInput = { po_line_id: string; quantity_received: number; quantity_rejected?: number; rejection_reason?: string }

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
  const poId = searchParams.get('po_id')

  let query = supabaseAdmin
    .from('procuretrack_goods_receipts')
    .select('*, received_by_user:received_by(email), lines:procuretrack_goods_receipt_lines(*)')
    .eq('tenant_id', profile.tenant_id)
    .order('received_at', { ascending: false })
  if (poId) query = query.eq('po_id', poId)

  const { data: receipts, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ receipts })
}

// Records what actually arrived against a PO, including partial
// deliveries and rejected items. Bumps on_hand_quantity for any tracked
// catalog item on the received lines, and -- only when that drop crosses
// reorder_point -- inserts a draft, auto_generated requisition rather
// than auto-submitting one, so approval/segregation of duties still
// apply to restocking.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }

  const body = await request.json()
  const { po_id, notes } = body
  const lines: GrnLineInput[] = Array.isArray(body.lines) ? body.lines : []
  if (!po_id || lines.length === 0) {
    return NextResponse.json({ error: 'po_id and at least one line are required' }, { status: 400 })
  }

  const { data: po } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('id, status')
    .eq('id', po_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  if (!['issued', 'partially_received'].includes(po.status)) {
    return NextResponse.json({ error: 'Only an issued or partially-received PO can receive goods' }, { status: 400 })
  }

  const { data: poLines } = await supabaseAdmin
    .from('procuretrack_po_lines')
    .select('id, quantity, catalog_item_id')
    .eq('po_id', po_id)
  const poLineById = new Map((poLines || []).map((l) => [l.id, l]))

  for (const line of lines) {
    if (!poLineById.has(line.po_line_id) || !Number.isFinite(Number(line.quantity_received))) {
      return NextResponse.json({ error: 'Each line needs a valid po_line_id and quantity_received' }, { status: 400 })
    }
  }

  const { data: priorLines } = await supabaseAdmin
    .from('procuretrack_goods_receipt_lines')
    .select('po_line_id, quantity_received')
    .in('po_line_id', Array.from(poLineById.keys()))

  const receivedSoFar = new Map<string, number>()
  for (const l of priorLines || []) {
    receivedSoFar.set(l.po_line_id, (receivedSoFar.get(l.po_line_id) || 0) + Number(l.quantity_received))
  }
  for (const line of lines) {
    receivedSoFar.set(line.po_line_id, (receivedSoFar.get(line.po_line_id) || 0) + Number(line.quantity_received))
  }

  const isFull = Array.from(poLineById.entries()).every(
    ([lineId, poLine]) => (receivedSoFar.get(lineId) || 0) >= Number(poLine.quantity)
  )

  const { data: grn, error } = await supabaseAdmin
    .from('procuretrack_goods_receipts')
    .insert({
      tenant_id: profile.tenant_id,
      po_id,
      received_by: user.id,
      status: isFull ? 'full' : 'partial',
      notes: notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabaseAdmin.from('procuretrack_goods_receipt_lines').insert(
    lines.map((l) => ({
      tenant_id: profile.tenant_id,
      grn_id: grn.id,
      po_line_id: l.po_line_id,
      quantity_received: Number(l.quantity_received),
      quantity_rejected: Number(l.quantity_rejected || 0),
      rejection_reason: l.rejection_reason || null,
    }))
  )

  await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .update({ status: isFull ? 'received' : 'partially_received', updated_at: new Date().toISOString() })
    .eq('id', po_id)

  // Inventory link: bump on_hand_quantity for any tracked catalog item on
  // the received lines, then check reorder_point.
  for (const line of lines) {
    const poLine = poLineById.get(line.po_line_id)
    if (!poLine?.catalog_item_id) continue

    const { data: catalogItem } = await supabaseAdmin
      .from('procuretrack_catalog_items')
      .select('id, track_inventory, on_hand_quantity, reorder_point, name, preferred_vendor_id')
      .eq('id', poLine.catalog_item_id)
      .single()
    if (!catalogItem?.track_inventory) continue

    const newOnHand = Number(catalogItem.on_hand_quantity) + Number(line.quantity_received)
    await supabaseAdmin
      .from('procuretrack_catalog_items')
      .update({ on_hand_quantity: newOnHand, updated_at: new Date().toISOString() })
      .eq('id', catalogItem.id)

    if (catalogItem.reorder_point != null && newOnHand < Number(catalogItem.reorder_point)) {
      await supabaseAdmin.from('procuretrack_requisitions').insert({
        tenant_id: profile.tenant_id,
        requested_by: user.id,
        catalog_item_id: catalogItem.id,
        item_description: `Restock: ${catalogItem.name} (below reorder point)`,
        quantity: 1,
        status: 'draft',
        auto_generated: true,
      })
    }
  }

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'grn', documentId: grn.id,
    userId: user.id, eventType: 'recorded', metadata: { po_id, status: grn.status },
  })

  return NextResponse.json({ receipt: grn }, { status: 201 })
}
