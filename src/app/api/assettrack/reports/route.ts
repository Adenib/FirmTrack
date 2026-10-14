import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { ASSETTRACK_STAFF_ROLES } from '@/lib/assettrack/roles'
import { classifyLaptop } from '@/lib/assettrack/policy'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OPEN_STATUSES = [
  'submitted', 'triage', 'remote_support', 'awaiting_device', 'diagnosis',
  'awaiting_approval', 'awaiting_parts', 'vendor_repair', 'testing', 'ready_for_collection',
]

type Ticket = {
  id: string
  asset_id: string | null
  status: string
  category: string
  vendor_name: string | null
  estimated_repair_cost: number | null
  decision: string | null
  created_at: string
  closed_at: string | null
  user_confirmed: boolean
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!ASSETTRACK_STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'IT staff access required' }, { status: 403 })
  }

  const [ticketsRes, assetsRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from('assettrack_tickets')
      .select('id, asset_id, status, category, vendor_name, estimated_repair_cost, decision, created_at, closed_at, user_confirmed')
      .eq('tenant_id', profile.tenant_id),
    supabaseAdmin
      .from('assettrack_assets')
      .select('id, asset_tag, purchase_date, warranty_end_date, asset_status')
      .eq('tenant_id', profile.tenant_id),
    supabaseAdmin
      .from('assettrack_sync_settings')
      .select('sla_days')
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle(),
  ])

  const tickets = (ticketsRes.data || []) as Ticket[]
  const assets = assetsRes.data || []
  const slaDays = settingsRes.data?.sla_days || 14

  const openByStatus: Record<string, number> = {}
  for (const t of tickets) {
    if (OPEN_STATUSES.includes(t.status)) openByStatus[t.status] = (openByStatus[t.status] || 0) + 1
  }

  const confirmedClosed = tickets.filter((t) => t.status === 'closed' && t.user_confirmed && t.closed_at)
  const avgTurnaroundDays = confirmedClosed.length
    ? confirmedClosed.reduce((sum, t) => sum + (new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()), 0) /
      confirmedClosed.length /
      (1000 * 60 * 60 * 24)
    : null

  const expenditureByCategory: Record<string, number> = {}
  const expenditureByVendor: Record<string, number> = {}
  let internalRepairCount = 0
  let vendorRepairCount = 0
  let warrantyRepairCount = 0
  let nonWarrantyRepairCount = 0

  const assetById = new Map(assets.map((a) => [a.id, a]))

  for (const t of tickets) {
    const cost = Number(t.estimated_repair_cost || 0)
    if (cost > 0) {
      expenditureByCategory[t.category] = (expenditureByCategory[t.category] || 0) + cost
      if (t.vendor_name) expenditureByVendor[t.vendor_name] = (expenditureByVendor[t.vendor_name] || 0) + cost
    }
    if (t.decision === 'repair' || t.decision === 'replace') {
      if (t.vendor_name) vendorRepairCount += 1
      else internalRepairCount += 1
    }
    if (t.decision === 'warranty') warrantyRepairCount += 1
    else if (t.decision === 'repair' || t.decision === 'replace') nonWarrantyRepairCount += 1
  }

  const ticketCountByAsset: Record<string, number> = {}
  for (const t of tickets) {
    if (t.asset_id) ticketCountByAsset[t.asset_id] = (ticketCountByAsset[t.asset_id] || 0) + 1
  }
  const repeatFaults = Object.entries(ticketCountByAsset)
    .filter(([, count]) => count >= 2)
    .map(([assetId, count]) => ({ assetId, assetTag: assetById.get(assetId)?.asset_tag || assetId, ticketCount: count }))
    .sort((a, b) => b.ticketCount - a.ticketCount)

  const retirementCandidates = assets
    .filter((a) => a.asset_status !== 'retired' && classifyLaptop(a) === 'old')
    .map((a) => ({ assetId: a.id, assetTag: a.asset_tag }))

  const now = Date.now()
  const overdueTickets = tickets
    .filter((t) => OPEN_STATUSES.includes(t.status))
    .filter((t) => (now - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24) > slaDays)
    .map((t) => ({ id: t.id, status: t.status, daysOpen: Math.floor((now - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24)) }))

  return NextResponse.json({
    openByStatus,
    avgTurnaroundDays,
    expenditureByCategory,
    expenditureByVendor,
    internalRepairCount,
    vendorRepairCount,
    warrantyRepairCount,
    nonWarrantyRepairCount,
    repeatFaults,
    retirementCandidates,
    overdueTickets,
    slaDays,
  })
}
