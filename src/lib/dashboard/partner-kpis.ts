import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function monthStart(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}
function yearStart(d: Date) {
  return `${d.getFullYear()}-01-01`
}
function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type PartnerKpis = {
  billing: { invoicedUsd: number; collectedUsd: number; outstandingUsd: number } | null
  trust: { balanceUsd: number } | null
  productivity: { billableHours: number; totalHours: number; avgUtilization: number | null } | null
  matters: { active: number; newThisMonth: number }
  topClients: { clientName: string; revenueUsd: number }[] | null
}

// Reuses the same computation patterns already proven in
// src/app/api/billtrack/reports/route.ts (invoiced/collected via
// journal_lines cash-line postings), .../accounttrack/statements/
// balance-sheet/route.ts (credit-normal account balance formula), and
// .../accounttrack/lawyer-overview/route.ts (hours/utilization), just
// aggregated firmwide for "this month" instead of per-lawyer/custom range.
export async function getPartnerKpis(tenantId: string, activeModules: Set<string>): Promise<PartnerKpis> {
  const now = new Date()
  const today = iso(now)
  const monthFrom = monthStart(now)
  const yearFrom = yearStart(now)

  const [billing, trust, productivity, matters, topClients] = await Promise.all([
    activeModules.has('billtrack') ? getBilling(tenantId, monthFrom, today) : Promise.resolve(null),
    activeModules.has('accounttrack') ? getTrustBalance(tenantId, today) : Promise.resolve(null),
    activeModules.has('timetrack') ? getProductivity(tenantId, monthFrom, today) : Promise.resolve(null),
    getMatters(tenantId, monthFrom),
    activeModules.has('billtrack') ? getTopClients(tenantId, yearFrom, today) : Promise.resolve(null),
  ])

  return { billing, trust, productivity, matters, topClients }
}

async function getBilling(tenantId: string, from: string, to: string) {
  const [invoicesRes, paymentEntriesRes, outstandingRes] = await Promise.all([
    supabaseAdmin
      .from('invoices')
      .select('total_amount_usd')
      .eq('tenant_id', tenantId)
      .neq('status', 'void')
      .gte('invoice_date', from)
      .lte('invoice_date', to),
    supabaseAdmin
      .from('journal_entries')
      .select('journal_lines(debit_usd, chart_of_accounts(key))')
      .eq('tenant_id', tenantId)
      .eq('source_type', 'invoice_payment')
      .gte('entry_date', from)
      .lte('entry_date', to),
    supabaseAdmin
      .from('invoices')
      .select('total_amount_usd, paid_amount_usd')
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'partially_paid']),
  ])

  const invoicedUsd = (invoicesRes.data || []).reduce((sum, i) => sum + Number(i.total_amount_usd || 0), 0)

  let collectedUsd = 0
  for (const entry of paymentEntriesRes.data || []) {
    const lines = Array.isArray(entry.journal_lines) ? entry.journal_lines : []
    for (const line of lines) {
      const acct = Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0] : line.chart_of_accounts
      if (acct?.key === 'operating_cash') collectedUsd += Number(line.debit_usd || 0)
    }
  }

  const outstandingUsd = (outstandingRes.data || []).reduce(
    (sum, i) => sum + (Number(i.total_amount_usd || 0) - Number(i.paid_amount_usd || 0)),
    0
  )

  return { invoicedUsd, collectedUsd, outstandingUsd }
}

async function getTrustBalance(tenantId: string, asOf: string) {
  const { data: account } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('key', 'trust_liability')
    .maybeSingle()
  if (!account) return { balanceUsd: 0 }

  const { data: lines } = await supabaseAdmin
    .from('journal_lines')
    .select('debit_usd, credit_usd, journal_entries!inner(entry_date, tenant_id)')
    .eq('tenant_id', tenantId)
    .eq('account_id', account.id)
    .lte('journal_entries.entry_date', asOf)

  // Credit-normal (liability) balance: credit - debit.
  const balanceUsd = (lines || []).reduce(
    (sum, l) => sum + Number(l.credit_usd || 0) - Number(l.debit_usd || 0),
    0
  )
  return { balanceUsd }
}

async function getProductivity(tenantId: string, from: string, to: string) {
  const { data: entries } = await supabaseAdmin
    .from('time_entries')
    .select('hours, billable')
    .eq('tenant_id', tenantId)
    .gte('entry_date', from)
    .lte('entry_date', to)

  const billableHours = (entries || []).filter((e) => e.billable).reduce((sum, e) => sum + Number(e.hours || 0), 0)
  const totalHours = (entries || []).reduce((sum, e) => sum + Number(e.hours || 0), 0)
  const avgUtilization = totalHours > 0 ? billableHours / totalHours : null

  return { billableHours, totalHours, avgUtilization }
}

async function getMatters(tenantId: string, monthFrom: string) {
  const [activeRes, newRes] = await Promise.all([
    supabaseAdmin.from('matters').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabaseAdmin
      .from('matters')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('open_date', monthFrom),
  ])
  return { active: activeRes.count || 0, newThisMonth: newRes.count || 0 }
}

async function getTopClients(tenantId: string, from: string, to: string) {
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('total_amount_usd, matters(client_id, clients(name))')
    .eq('tenant_id', tenantId)
    .neq('status', 'void')
    .gte('invoice_date', from)
    .lte('invoice_date', to)

  const revenueByClient = new Map<string, number>()
  for (const inv of invoices || []) {
    const matter = Array.isArray(inv.matters) ? inv.matters[0] : inv.matters
    const client = matter?.clients ? (Array.isArray(matter.clients) ? matter.clients[0] : matter.clients) : null
    const name = client?.name
    if (!name) continue
    revenueByClient.set(name, (revenueByClient.get(name) || 0) + Number(inv.total_amount_usd || 0))
  }

  return [...revenueByClient.entries()]
    .map(([clientName, revenueUsd]) => ({ clientName, revenueUsd }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd)
    .slice(0, 5)
}
