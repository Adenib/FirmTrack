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

// Staff record a quote a vendor sent them (by phone/email/offline) --
// vendor self-service submission through the portal is a separate route
// (/api/procuretrack/portal/quotes).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rfqId } = await params
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

  const { data: rfq } = await supabaseAdmin
    .from('procuretrack_rfqs')
    .select('id, status')
    .eq('id', rfqId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })
  if (rfq.status !== 'open') return NextResponse.json({ error: 'RFQ is not open for quotes' }, { status: 400 })

  const body = await request.json()
  const { vendor_id, unit_price, quantity, lead_time_days, notes } = body
  const unitPriceNum = Number(unit_price)
  const quantityNum = Number(quantity ?? 1)
  if (!vendor_id || !Number.isFinite(unitPriceNum) || unitPriceNum <= 0) {
    return NextResponse.json({ error: 'vendor_id and a positive unit_price are required' }, { status: 400 })
  }

  const { data: quote, error } = await supabaseAdmin
    .from('procuretrack_rfq_quotes')
    .insert({
      tenant_id: profile.tenant_id,
      rfq_id: rfqId,
      vendor_id,
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

// Select the winning quote -- always requires a written reason, flips the
// RFQ to 'awarded', and unselects every other quote on the same RFQ.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rfqId } = await params
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
  const { quote_id, selection_reason } = body
  if (!quote_id || typeof selection_reason !== 'string' || !selection_reason.trim()) {
    return NextResponse.json({ error: 'quote_id and a written selection_reason are required' }, { status: 400 })
  }

  const { data: quote } = await supabaseAdmin
    .from('procuretrack_rfq_quotes')
    .select('id')
    .eq('id', quote_id)
    .eq('rfq_id', rfqId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!quote) return NextResponse.json({ error: 'Quote not found on this RFQ' }, { status: 404 })

  await supabaseAdmin
    .from('procuretrack_rfq_quotes')
    .update({ is_selected: false, selection_reason: null })
    .eq('rfq_id', rfqId)

  const { data: selected, error } = await supabaseAdmin
    .from('procuretrack_rfq_quotes')
    .update({ is_selected: true, selection_reason: selection_reason.trim() })
    .eq('id', quote_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from('procuretrack_rfqs')
    .update({ status: 'awarded', closed_at: new Date().toISOString() })
    .eq('id', rfqId)
    .select()
    .single()
  if (rfqError) return NextResponse.json({ error: rfqError.message }, { status: 500 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'requisition', documentId: rfq.requisition_id,
    userId: user.id, eventType: 'quote_selected', metadata: { rfq_id: rfqId, quote_id, selection_reason: selection_reason.trim() },
  })

  return NextResponse.json({ quote: selected, rfq })
}
