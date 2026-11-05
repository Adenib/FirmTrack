import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getVendorPortalProfile } from '@/lib/procuretrack/portal-auth'
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_SIZE, ALLOWED_DOCUMENT_TYPES } from '@/lib/doctrack/constants'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A vendor uploads their invoice document + headline figures against one
// of their own POs. This lands as a 'pending_match' header with no line
// items yet (the vendor doesn't know the PO's internal line structure) --
// AP completes the real, line-level 3-way match by capturing the full
// invoice through the internal /api/procuretrack/invoices route against
// the same po_id once they've reviewed the attachment. This row exists
// so AP is notified and has the attachment on file, not as the final
// matched record.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const portalProfile = await getVendorPortalProfile(supabase)
  if (!portalProfile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const formData = await request.formData()
  const poId = formData.get('po_id')
  const invoiceNumber = formData.get('invoice_number')
  const invoiceDate = formData.get('invoice_date')
  const totalAmount = formData.get('total_amount')
  const file = formData.get('file')

  if (typeof poId !== 'string' || typeof invoiceNumber !== 'string' || typeof invoiceDate !== 'string' || !totalAmount) {
    return NextResponse.json({ error: 'po_id, invoice_number, invoice_date, and total_amount are required' }, { status: 400 })
  }
  const totalAmountNum = Number(totalAmount)
  if (!Number.isFinite(totalAmountNum) || totalAmountNum <= 0) {
    return NextResponse.json({ error: 'total_amount must be a positive number' }, { status: 400 })
  }

  const { data: po } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('id')
    .eq('id', poId)
    .eq('vendor_id', portalProfile.vendorId)
    .eq('tenant_id', portalProfile.tenantId)
    .single()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  let attachmentPath: string | null = null
  if (file instanceof File) {
    if (!ALLOWED_DOCUMENT_TYPES[file.type]) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    if (file.size > MAX_DOCUMENT_SIZE) return NextResponse.json({ error: 'File must be 25MB or smaller' }, { status: 400 })

    attachmentPath = `${portalProfile.tenantId}/procuretrack-invoices/${poId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).upload(attachmentPath, file, { contentType: file.type })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: invoice, error } = await supabaseAdmin
    .from('procuretrack_invoices')
    .insert({
      tenant_id: portalProfile.tenantId,
      po_id: poId,
      vendor_id: portalProfile.vendorId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      subtotal: totalAmountNum,
      total_amount: totalAmountNum,
      attachment_path: attachmentPath,
      status: 'pending_match',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ invoice }, { status: 201 })
}

export async function GET() {
  const supabase = await createServerClient()
  const portalProfile = await getVendorPortalProfile(supabase)
  if (!portalProfile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: invoices, error } = await supabaseAdmin
    .from('procuretrack_invoices')
    .select('*, po:po_id(po_number)')
    .eq('vendor_id', portalProfile.vendorId)
    .eq('tenant_id', portalProfile.tenantId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoices })
}
