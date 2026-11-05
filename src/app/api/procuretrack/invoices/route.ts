import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_AP_ROLES } from '@/lib/procuretrack/roles'
import { match3Way, type PoLine, type ReceivedLine, type InvoiceLine } from '@/lib/procuretrack/three-way-match'
import { logProcuretrackEvent } from '@/lib/procuretrack/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type InvoiceLineInput = { po_line_id?: string | null; description: string; quantity: number; unit_price: number }

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
  const status = searchParams.get('status')
  const poId = searchParams.get('po_id')

  let query = supabaseAdmin
    .from('procuretrack_invoices')
    .select('*, vendor:vendor_id(name), po:po_id(po_number), lines:procuretrack_invoice_lines(*)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  if (poId) query = query.eq('po_id', poId)

  const { data: invoices, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoices })
}

// Captures a vendor invoice against a PO and immediately runs the 3-way
// match (PO vs. goods received vs. this invoice). Never auto-advances
// past 'mismatched' -- a human (AP) has to review and explicitly move it
// forward, same "suggest, never auto-apply" posture as Bank
// Reconciliation's suggestMatches.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!PROCURETRACK_AP_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Accounts/owner/admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { po_id, invoice_number, invoice_date, due_date, tax_amount } = body
  const lines: InvoiceLineInput[] = Array.isArray(body.lines) ? body.lines : []
  if (!po_id || !invoice_number || !invoice_date || lines.length === 0) {
    return NextResponse.json({ error: 'po_id, invoice_number, invoice_date, and at least one line are required' }, { status: 400 })
  }

  const { data: po } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('id, vendor_id, lines:procuretrack_po_lines(*)')
    .eq('id', po_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0)
  const taxAmountNum = tax_amount != null ? Number(tax_amount) : 0
  const totalAmount = Math.round((subtotal + taxAmountNum) * 100) / 100

  const { data: invoice, error } = await supabaseAdmin
    .from('procuretrack_invoices')
    .insert({
      tenant_id: profile.tenant_id,
      po_id,
      vendor_id: po.vendor_id,
      invoice_number,
      invoice_date,
      due_date: due_date || null,
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount: taxAmountNum,
      total_amount: totalAmount,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabaseAdmin.from('procuretrack_invoice_lines').insert(
    lines.map((l) => ({
      tenant_id: profile.tenant_id,
      invoice_id: invoice.id,
      po_line_id: l.po_line_id || null,
      description: l.description,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      line_total: Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100,
    }))
  )

  const { data: grnLines } = await supabaseAdmin
    .from('procuretrack_goods_receipt_lines')
    .select('po_line_id, quantity_received')
    .in('po_line_id', (po.lines as { id: string }[]).map((l) => l.id))

  const poLines: PoLine[] = (po.lines as { id: string; description: string; quantity: number; unit_price: number }[]).map((l) => ({
    poLineId: l.id, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unit_price),
  }))
  const receivedLines: ReceivedLine[] = (grnLines || []).map((g) => ({
    poLineId: g.po_line_id, quantityReceived: Number(g.quantity_received),
  }))
  const invoiceLines: InvoiceLine[] = lines.map((l) => ({
    poLineId: l.po_line_id || null, quantity: Number(l.quantity), unitPrice: Number(l.unit_price),
  }))

  const matchResult = match3Way(poLines, receivedLines, invoiceLines)

  const { data: updatedInvoice, error: matchError } = await supabaseAdmin
    .from('procuretrack_invoices')
    .update({
      status: matchResult.status,
      match_result: matchResult,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)
    .select()
    .single()
  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'invoice', documentId: invoice.id,
    userId: user.id, eventType: 'captured', metadata: { match_status: matchResult.status },
  })

  return NextResponse.json({ invoice: updatedInvoice }, { status: 201 })
}

// AP review action after a mismatch -- explicitly moves a mismatched
// invoice forward to 'approved' (so it can be paid) with a required note,
// or rejects it outright. This is the one human-in-the-loop step the
// 3-way match itself never takes.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!PROCURETRACK_AP_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Accounts/owner/admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { id, status, review_note } = body
  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'id and a valid status (approved|rejected) are required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('procuretrack_invoices')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (!['matched', 'mismatched'].includes(existing.status)) {
    return NextResponse.json({ error: 'Only a matched or mismatched invoice can be reviewed' }, { status: 400 })
  }
  if (existing.status === 'mismatched' && status === 'approved' && !review_note) {
    return NextResponse.json({ error: 'review_note is required to approve a mismatched invoice' }, { status: 400 })
  }

  const { data: invoice, error } = await supabaseAdmin
    .from('procuretrack_invoices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'invoice', documentId: id,
    userId: user.id, eventType: status === 'approved' ? 'ap_approved' : 'ap_rejected',
    metadata: { review_note: review_note || null },
  })

  return NextResponse.json({ invoice })
}
