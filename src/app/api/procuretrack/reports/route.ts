import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// Plain-JS aggregation over rows fetched via supabaseAdmin -- same
// approach as BillTrack/AccountTrack's own reports routes, no
// materialized views for v1.
export async function GET() {
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

  const [{ data: pos }, { data: rfqs }, { data: grns }, { data: quotes }] = await Promise.all([
    supabaseAdmin
      .from('procuretrack_purchase_orders')
      .select('id, status, total_amount, created_at, closed_at, vendor:vendor_id(name), department:department_id(name)')
      .eq('tenant_id', profile.tenant_id),
    supabaseAdmin
      .from('procuretrack_rfqs')
      .select('id, created_at, closed_at, status')
      .eq('tenant_id', profile.tenant_id),
    supabaseAdmin
      .from('procuretrack_goods_receipts')
      .select('id, po_id, received_at, po:po_id(created_at)')
      .eq('tenant_id', profile.tenant_id),
    supabaseAdmin
      .from('procuretrack_rfq_quotes')
      .select('rfq_id, unit_price, quantity, is_selected')
      .eq('tenant_id', profile.tenant_id),
  ])

  // Spend by vendor / department (non-cancelled POs).
  const spendByVendor: Record<string, number> = {}
  const spendByDepartment: Record<string, number> = {}
  for (const po of pos || []) {
    if (po.status === 'cancelled') continue
    const vendorName = (po.vendor as unknown as { name: string } | null)?.name || 'Unknown vendor'
    const deptName = (po.department as unknown as { name: string } | null)?.name || 'No department'
    spendByVendor[vendorName] = (spendByVendor[vendorName] || 0) + Number(po.total_amount)
    spendByDepartment[deptName] = (spendByDepartment[deptName] || 0) + Number(po.total_amount)
  }

  // PO cycle time: days between creation and closing, for closed POs.
  const cycleTimes = (pos || [])
    .filter((po) => po.closed_at)
    .map((po) => (new Date(po.closed_at as string).getTime() - new Date(po.created_at).getTime()) / (24 * 60 * 60 * 1000))
  const avgPoCycleDays = cycleTimes.length > 0 ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10 : null

  // RFQ savings: for each awarded RFQ, selected quote's total vs. the
  // average of all quotes received on it.
  const quotesByRfq = new Map<string, { unitPrice: number; quantity: number; isSelected: boolean }[]>()
  for (const q of quotes || []) {
    const list = quotesByRfq.get(q.rfq_id) || []
    list.push({ unitPrice: Number(q.unit_price), quantity: Number(q.quantity), isSelected: q.is_selected })
    quotesByRfq.set(q.rfq_id, list)
  }
  let totalQuoted = 0
  let totalSelected = 0
  let rfqsWithSavingsData = 0
  for (const [, qs] of quotesByRfq) {
    const selected = qs.find((q) => q.isSelected)
    if (!selected || qs.length < 2) continue
    const avgTotal = qs.reduce((sum, q) => sum + q.unitPrice * q.quantity, 0) / qs.length
    totalQuoted += avgTotal
    totalSelected += selected.unitPrice * selected.quantity
    rfqsWithSavingsData++
  }
  const estimatedRfqSavings = rfqsWithSavingsData > 0 ? Math.round((totalQuoted - totalSelected) * 100) / 100 : null

  // Late deliveries: a GRN recorded more than 14 days after its PO was
  // created (no per-PO expected-delivery-date field in v1, so this is a
  // blunt but honest proxy).
  const lateDeliveries = (grns || []).filter((g) => {
    const po = g.po as unknown as { created_at: string } | null
    if (!po) return false
    const days = (new Date(g.received_at).getTime() - new Date(po.created_at).getTime()) / (24 * 60 * 60 * 1000)
    return days > 14
  }).length

  return NextResponse.json({
    spendByVendor,
    spendByDepartment,
    avgPoCycleDays,
    estimatedRfqSavings,
    openRfqCount: (rfqs || []).filter((r) => r.status === 'open').length,
    lateDeliveries,
    totalPoCount: (pos || []).length,
  })
}
