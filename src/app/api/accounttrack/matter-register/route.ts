import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Bulk, tenant-wide version of /api/timetrack/matter-summary's aggregation
// logic — batches 4 queries across all matters on the current page instead
// of one query per matter, to avoid N+1 as matter counts grow.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const tenantId = profile.tenant_id
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const status = searchParams.get('status') || 'active'
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)
  const offset = Number(searchParams.get('offset')) || 0

  let mattersQuery = supabaseAdmin
    .from('matters')
    .select('id, matter_id, case_name, description, status, client_id, clients(name)')
    .eq('tenant_id', tenantId)
    .order('open_date', { ascending: false })
    .range(offset, offset + limit - 1)

  let countQuery = supabaseAdmin
    .from('matters')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (status !== 'all') {
    mattersQuery = mattersQuery.eq('status', status)
    countQuery = countQuery.eq('status', status)
  }
  if (q) {
    const orFilter = `matter_id.ilike.%${q}%,case_name.ilike.%${q}%`
    mattersQuery = mattersQuery.or(orFilter)
    countQuery = countQuery.or(orFilter)
  }

  const [{ data: matters, error: mattersError }, { count: totalCount }] = await Promise.all([
    mattersQuery,
    countQuery,
  ])

  if (mattersError) return NextResponse.json({ error: mattersError.message }, { status: 500 })

  const matterIds = (matters || []).map((m) => m.id)

  const [entriesRes, disbursementsRes, ledgerRes, invoicesRes] = matterIds.length === 0
    ? [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabaseAdmin
          .from('time_entries')
          .select('hours, amount, billable, status, matter_id')
          .eq('tenant_id', tenantId)
          .in('matter_id', matterIds),
        supabaseAdmin
          .from('disbursements')
          .select('amount, matter_id')
          .eq('tenant_id', tenantId)
          .eq('billed', false)
          .in('matter_id', matterIds),
        supabaseAdmin
          .from('trust_ledger_entries')
          .select('ledger_type, amount, matter_id')
          .eq('tenant_id', tenantId)
          .in('matter_id', matterIds),
        supabaseAdmin
          .from('invoices')
          .select('total_amount, paid_amount, status, matter_id')
          .eq('tenant_id', tenantId)
          .neq('status', 'void')
          .in('matter_id', matterIds),
      ])

  // Group each result array once (O(n)), not once per matter.
  const byMatter = <T extends { matter_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      const list = map.get(row.matter_id)
      if (list) list.push(row)
      else map.set(row.matter_id, [row])
    }
    return map
  }

  const entriesByMatter = byMatter(entriesRes.data || [])
  const disbursementsByMatter = byMatter(disbursementsRes.data || [])
  const ledgerByMatter = byMatter(ledgerRes.data || [])
  const invoicesByMatter = byMatter(invoicesRes.data || [])

  const results = (matters || []).map((matter) => {
    const entries = entriesByMatter.get(matter.id) || []
    const billableHours = entries.filter((e) => e.billable).reduce((sum, e) => sum + Number(e.hours || 0), 0)
    const nonBillableHours = entries.filter((e) => !e.billable).reduce((sum, e) => sum + Number(e.hours || 0), 0)

    const unbilledEntries = entries.filter((e) => e.billable && ['draft', 'submitted'].includes(e.status))
    const unbilledHours = unbilledEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0)
    const unbilledFees = unbilledEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)

    const unbilledDisbursements = (disbursementsByMatter.get(matter.id) || [])
      .reduce((sum, d) => sum + Number(d.amount || 0), 0)

    const ledger = ledgerByMatter.get(matter.id) || []
    const trustBalance = ledger
      .filter((l) => l.ledger_type === 'trust')
      .reduce((sum, l) => sum + Number(l.amount || 0), 0)
    const retainerBalance = ledger
      .filter((l) => l.ledger_type === 'retainer')
      .reduce((sum, l) => sum + Number(l.amount || 0), 0)

    const accountsReceivable = (invoicesByMatter.get(matter.id) || [])
      .reduce((sum, inv) => sum + (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)), 0)

    return {
      matter: {
        id: matter.id,
        matter_id: matter.matter_id,
        case_name: matter.case_name,
        re_line: matter.description || matter.case_name,
        client_name: (Array.isArray(matter.clients) ? matter.clients[0] : matter.clients)?.name || null,
        status: matter.status,
      },
      hours: { billable: billableHours, non_billable: nonBillableHours, total: billableHours + nonBillableHours },
      unbilled: { hours: unbilledHours, fees: unbilledFees, disbursements: unbilledDisbursements },
      accounts_receivable: accountsReceivable,
      trust_balance: trustBalance,
      retainer_balance: retainerBalance,
    }
  })

  return NextResponse.json({ matters: results, total_count: totalCount || 0, limit, offset })
}
