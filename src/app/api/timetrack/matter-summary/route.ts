import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Read-only aggregate for the TimeTrack matter summary card. Deliberately
// ungated by subscription/module — it's surfaced inside the already-open
// TimeTrack page, same as TimeTrack itself has always been.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matter_id')
  if (!matterId) return NextResponse.json({ error: 'matter_id is required' }, { status: 400 })

  const tenantId = profile.tenant_id

  const [matterRes, entriesRes, disbursementsRes, ledgerRes, invoicesRes] = await Promise.all([
    supabaseAdmin
      .from('matters')
      .select('id, matter_id, case_name, description, billing_currency, clients(name)')
      .eq('id', matterId)
      .eq('tenant_id', tenantId)
      .single(),
    supabaseAdmin
      .from('time_entries')
      .select('hours, amount, billable, status')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId),
    supabaseAdmin
      .from('disbursements')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId)
      .eq('billed', false),
    supabaseAdmin
      .from('trust_ledger_entries')
      .select('ledger_type, amount')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId),
    supabaseAdmin
      .from('invoices')
      .select('total_amount, paid_amount, status')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId)
      .neq('status', 'void'),
  ])

  if (matterRes.error) return NextResponse.json({ error: matterRes.error.message }, { status: 404 })

  const entries = entriesRes.data || []
  const billableHours = entries.filter((e) => e.billable).reduce((sum, e) => sum + Number(e.hours || 0), 0)
  const nonBillableHours = entries.filter((e) => !e.billable).reduce((sum, e) => sum + Number(e.hours || 0), 0)
  const totalAmount = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  const unbilledEntries = entries.filter((e) => e.billable && ['draft', 'submitted'].includes(e.status))
  const unbilledHours = unbilledEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0)
  const unbilledFees = unbilledEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  const unbilledDisbursements = (disbursementsRes.data || []).reduce(
    (sum, d) => sum + Number(d.amount || 0), 0
  )

  const ledger = ledgerRes.data || []
  const trustBalance = ledger
    .filter((l) => l.ledger_type === 'trust')
    .reduce((sum, l) => sum + Number(l.amount || 0), 0)
  const retainerBalance = ledger
    .filter((l) => l.ledger_type === 'retainer')
    .reduce((sum, l) => sum + Number(l.amount || 0), 0)

  const accountsReceivable = (invoicesRes.data || []).reduce(
    (sum, inv) => sum + (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)), 0
  )

  const matter = matterRes.data
  const client = Array.isArray(matter.clients) ? matter.clients[0] : matter.clients

  return NextResponse.json({
    matter: {
      matter_id: matter.matter_id,
      case_name: matter.case_name,
      re_line: matter.description || matter.case_name,
      client_name: client?.name || null,
      currency: matter.billing_currency || null,
    },
    hours: {
      billable: billableHours,
      non_billable: nonBillableHours,
      total: billableHours + nonBillableHours,
    },
    amount_total: totalAmount,
    unbilled: {
      hours: unbilledHours,
      fees: unbilledFees,
      disbursements: unbilledDisbursements,
    },
    accounts_receivable: accountsReceivable,
    trust_balance: trustBalance,
    retainer_balance: retainerBalance,
  })
}
