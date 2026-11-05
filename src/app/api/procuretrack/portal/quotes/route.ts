import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getVendorPortalProfile } from '@/lib/procuretrack/portal-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A vendor submits their own quote on an RFQ they were invited to --
// this is the self-service counterpart to the internal
// /api/procuretrack/rfqs/[id]/quotes route staff use to record a quote
// that came in by phone/email.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const portalProfile = await getVendorPortalProfile(supabase)
  if (!portalProfile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const { rfq_id, unit_price, quantity, lead_time_days, notes } = body
  const unitPriceNum = Number(unit_price)
  const quantityNum = Number(quantity ?? 1)
  if (!rfq_id || !Number.isFinite(unitPriceNum) || unitPriceNum <= 0) {
    return NextResponse.json({ error: 'rfq_id and a positive unit_price are required' }, { status: 400 })
  }

  const { data: invitation } = await supabaseAdmin
    .from('procuretrack_rfq_vendors')
    .select('rfq_id')
    .eq('rfq_id', rfq_id)
    .eq('vendor_id', portalProfile.vendorId)
    .eq('tenant_id', portalProfile.tenantId)
    .single()
  if (!invitation) return NextResponse.json({ error: 'You were not invited to this RFQ' }, { status: 403 })

  const { data: rfq } = await supabaseAdmin
    .from('procuretrack_rfqs')
    .select('id, status')
    .eq('id', rfq_id)
    .single()
  if (!rfq || rfq.status !== 'open') {
    return NextResponse.json({ error: 'This RFQ is no longer open for quotes' }, { status: 400 })
  }

  const { data: quote, error } = await supabaseAdmin
    .from('procuretrack_rfq_quotes')
    .insert({
      tenant_id: portalProfile.tenantId,
      rfq_id,
      vendor_id: portalProfile.vendorId,
      unit_price: unitPriceNum,
      quantity: quantityNum,
      total_price: Math.round(unitPriceNum * quantityNum * 100) / 100,
      lead_time_days: lead_time_days != null ? Number(lead_time_days) : null,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ quote }, { status: 201 })
}
