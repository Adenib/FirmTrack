import { createClient } from '@supabase/supabase-js'
import { getExchangeRate, ExchangeRateError } from './exchange-rate'
import {
  computeMatterProfitability, rollupTimekeeperProfitability, rollupClientProfitability, rollupByGroup, computeTrend,
  type MatterProfitability, type TimekeeperProfitability, type TrendBucket, type TimeEntryForProfitability,
} from './profitability'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type LawyerJoin = { category_id: string | null; lawyer_categories: { name: string } | null } | null

type TimeEntryRow = {
  id: string
  lawyer_id: string | null
  hours: number | null
  amount: number | null
  billable: boolean
  status: string
  entry_date: string
  write_off_amount: number | null
  internal_cost_amount: number | null
  lawyers: LawyerJoin
}

function mapEntryRow(e: TimeEntryRow): TimeEntryForProfitability {
  return {
    id: e.id,
    lawyer_id: e.lawyer_id,
    hours: e.hours,
    amount: e.amount,
    billable: e.billable,
    status: e.status,
    entry_date: e.entry_date,
    write_off_amount: e.write_off_amount || 0,
    internal_cost_amount: e.internal_cost_amount,
    lawyer_category: e.lawyers?.lawyer_categories?.name ?? null,
  }
}

const ENTRY_SELECT = 'id, lawyer_id, hours, amount, billable, status, entry_date, write_off_amount, internal_cost_amount, lawyers(category_id, lawyer_categories(name))'
const DISB_SELECT = 'matter_id, amount, billed, disb_date'
const INVOICE_SELECT = 'matter_id, fees_amount, disbursements_amount, total_amount, paid_amount, status, due_date, invoice_date'
const BUDGET_SELECT = 'matter_id, target_hours, target_billable_hours, target_revenue, period_start, period_end'

export type MatterProfitabilityResult = {
  profitability: MatterProfitability
  timekeepers: TimekeeperProfitability[]
}

// Matter-scoped queries -- used by the single-matter route, where fetching
// the whole tenant would be wasteful.
export async function loadMatterProfitability(tenantId: string, matterId: string): Promise<MatterProfitabilityResult> {
  const today = new Date().toISOString().split('T')[0]

  const [entriesRes, disbursementsRes, invoicesRes, budgetRes] = await Promise.all([
    supabaseAdmin.from('time_entries').select(ENTRY_SELECT).eq('tenant_id', tenantId).eq('matter_id', matterId),
    supabaseAdmin.from('disbursements').select(DISB_SELECT).eq('tenant_id', tenantId).eq('matter_id', matterId),
    supabaseAdmin.from('invoices').select(INVOICE_SELECT).eq('tenant_id', tenantId).eq('matter_id', matterId).neq('status', 'void'),
    supabaseAdmin.from('budgets').select(BUDGET_SELECT).eq('tenant_id', tenantId).eq('matter_id', matterId)
      .lte('period_start', today).gte('period_end', today).maybeSingle(),
  ])

  const timeEntries = ((entriesRes.data || []) as unknown as TimeEntryRow[]).map(mapEntryRow)

  const profitability = computeMatterProfitability({
    timeEntries,
    disbursements: disbursementsRes.data || [],
    invoices: invoicesRes.data || [],
    budget: budgetRes.data ?? undefined,
  })
  const timekeepers = rollupTimekeeperProfitability(timeEntries)

  return { profitability, timekeepers }
}

export async function loadMatterTrend(tenantId: string, matterId: string, groupBy: 'month' | 'quarter'): Promise<TrendBucket[]> {
  const [entriesRes, disbursementsRes, invoicesRes] = await Promise.all([
    supabaseAdmin.from('time_entries').select(ENTRY_SELECT).eq('tenant_id', tenantId).eq('matter_id', matterId),
    supabaseAdmin.from('disbursements').select(DISB_SELECT).eq('tenant_id', tenantId).eq('matter_id', matterId),
    supabaseAdmin.from('invoices').select(INVOICE_SELECT).eq('tenant_id', tenantId).eq('matter_id', matterId).neq('status', 'void'),
  ])

  const timeEntries = ((entriesRes.data || []) as unknown as TimeEntryRow[]).map(mapEntryRow)

  return computeTrend({
    timeEntries,
    disbursements: disbursementsRes.data || [],
    invoices: invoicesRes.data || [],
    groupBy,
  })
}

export type MatterRow = { id: string; matter_id: string; case_name: string; client_id: string; responsible_lawyer: string | null; law_type: string | null; billing_currency: string | null }

function scaleMoneyFields(p: MatterProfitability, rate: number): MatterProfitability {
  if (rate === 1) return p
  return {
    ...p,
    revenue: p.revenue * rate,
    cost: { timeCost: p.cost.timeCost * rate, expenses: p.cost.expenses * rate, total: p.cost.total * rate },
    profit: p.profit * rate,
    feesCollected: p.feesCollected * rate,
    recordedBillableValue: p.recordedBillableValue * rate,
    invoicedBillableValue: p.invoicedBillableValue * rate,
    wip: p.wip * rate,
    wipAging: {
      current: p.wipAging.current * rate,
      days30: p.wipAging.days30 * rate,
      days60: p.wipAging.days60 * rate,
      days90Plus: p.wipAging.days90Plus * rate,
    },
    writeOffs: p.writeOffs * rate,
    // marginPct / collectionRate / realisationRate are ratios -- unaffected by currency scaling.
  }
}

function groupByKey<T extends Record<string, unknown>>(rows: T[], key: string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = row[key] as string
    if (!k) continue
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(row)
  }
  return map
}

// Fetches every matter's profitability for the tenant in one batch (rather
// than N+1 per-matter queries), then converts each matter's money figures
// into the org's base currency so cross-matter rollups (client, team,
// firmwide flags) never silently mix currencies -- same discipline
// create-invoice.ts already applies per-transaction.
async function batchLoadAllMatters(tenantId: string): Promise<Map<string, { matter: MatterRow; profitability: MatterProfitability }>> {
  const today = new Date().toISOString().split('T')[0]

  const [mattersRes, entriesRes, disbursementsRes, invoicesRes, budgetsRes, orgRes] = await Promise.all([
    supabaseAdmin.from('matters').select('id, matter_id, case_name, client_id, responsible_lawyer, law_type, billing_currency').eq('tenant_id', tenantId),
    supabaseAdmin.from('time_entries').select(`matter_id, ${ENTRY_SELECT}`).eq('tenant_id', tenantId),
    supabaseAdmin.from('disbursements').select(DISB_SELECT).eq('tenant_id', tenantId),
    supabaseAdmin.from('invoices').select(INVOICE_SELECT).eq('tenant_id', tenantId).neq('status', 'void'),
    supabaseAdmin.from('budgets').select(BUDGET_SELECT).eq('tenant_id', tenantId).not('matter_id', 'is', null)
      .lte('period_start', today).gte('period_end', today),
    supabaseAdmin.from('organizations').select('base_currency').eq('id', tenantId).single(),
  ])

  const matters = (mattersRes.data || []) as MatterRow[]
  const entriesByMatter = groupByKey((entriesRes.data || []) as unknown as (TimeEntryRow & { matter_id: string })[], 'matter_id')
  const disbByMatter = groupByKey((disbursementsRes.data || []) as (Record<string, unknown> & { matter_id: string })[], 'matter_id')
  const invByMatter = groupByKey((invoicesRes.data || []) as (Record<string, unknown> & { matter_id: string })[], 'matter_id')
  const budgetByMatter = new Map((budgetsRes.data || []).map((b) => [b.matter_id as string, b]))
  const baseCurrency = orgRes.data?.base_currency || 'NGN'

  const results = new Map<string, { matter: MatterRow; profitability: MatterProfitability }>()
  for (const m of matters) {
    const timeEntries = (entriesByMatter.get(m.id) || []).map(mapEntryRow)
    const profitability = computeMatterProfitability({
      timeEntries,
      // @ts-expect-error -- grouped rows carry an extra matter_id key the calc engine doesn't need
      disbursements: disbByMatter.get(m.id) || [],
      // @ts-expect-error -- same as above
      invoices: invByMatter.get(m.id) || [],
      budget: budgetByMatter.get(m.id) as never,
    })

    const matterCurrency = m.billing_currency || baseCurrency
    let converted = profitability
    if (matterCurrency !== baseCurrency) {
      try {
        const rate = await getExchangeRate(tenantId, matterCurrency, baseCurrency, today)
        converted = scaleMoneyFields(profitability, rate)
      } catch (err) {
        // No FX rate configured for this matter's currency -- surface the
        // matter unconverted rather than dropping it from firmwide
        // rollups; a tenant that never set up multi-currency rates has
        // everything in one currency anyway and never hits this branch.
        if (!(err instanceof ExchangeRateError)) throw err
      }
    }

    results.set(m.id, { matter: m, profitability: converted })
  }

  return results
}

// Bucketing by date doesn't care which matter a row came from, so a
// client's trend is just every one of its matters' entries/disbursements/
// invoices concatenated before handing off to computeTrend.
export async function loadClientTrend(tenantId: string, clientId: string, groupBy: 'month' | 'quarter'): Promise<TrendBucket[]> {
  const { data: matters } = await supabaseAdmin.from('matters').select('id').eq('tenant_id', tenantId).eq('client_id', clientId)
  const matterIds = (matters || []).map((m) => m.id)
  if (matterIds.length === 0) return []

  const [entriesRes, disbursementsRes, invoicesRes] = await Promise.all([
    supabaseAdmin.from('time_entries').select(ENTRY_SELECT).eq('tenant_id', tenantId).in('matter_id', matterIds),
    supabaseAdmin.from('disbursements').select(DISB_SELECT).eq('tenant_id', tenantId).in('matter_id', matterIds),
    supabaseAdmin.from('invoices').select(INVOICE_SELECT).eq('tenant_id', tenantId).in('matter_id', matterIds).neq('status', 'void'),
  ])

  const timeEntries = ((entriesRes.data || []) as unknown as TimeEntryRow[]).map(mapEntryRow)

  return computeTrend({
    timeEntries,
    disbursements: disbursementsRes.data || [],
    invoices: invoicesRes.data || [],
    groupBy,
  })
}

export type ClientProfitabilityResult = {
  rollup: ReturnType<typeof rollupClientProfitability>
  matters: { matterId: string; matter: MatterRow; profitability: MatterProfitability }[]
}

export async function loadClientProfitability(tenantId: string, clientId: string): Promise<ClientProfitabilityResult> {
  const all = await batchLoadAllMatters(tenantId)
  const clientMatters = [...all.entries()].filter(([, r]) => r.matter.client_id === clientId)
  const rollup = rollupClientProfitability(clientMatters.map(([matterId, r]) => ({ matterId, profitability: r.profitability })))
  return {
    rollup,
    matters: clientMatters.map(([matterId, r]) => ({ matterId, matter: r.matter, profitability: r.profitability })),
  }
}

export async function loadTeamProfitability(tenantId: string, groupBy: 'responsible_lawyer' | 'law_type') {
  const all = await batchLoadAllMatters(tenantId)
  const matters = [...all.values()].map((r) => r.matter)
  const resultsMap = new Map([...all.entries()].map(([id, r]) => [id, r.profitability]))
  return rollupByGroup(matters, resultsMap, groupBy)
}

export type FirmwideFlag = { matterId: string; matterLabel: string; flag: MatterProfitability['flags'][number] }

export async function loadFirmwideFlags(tenantId: string): Promise<FirmwideFlag[]> {
  const all = await batchLoadAllMatters(tenantId)
  const flags: FirmwideFlag[] = []
  for (const [matterId, { matter, profitability }] of all) {
    for (const flag of profitability.flags) {
      flags.push({ matterId, matterLabel: `${matter.matter_id} · ${matter.case_name}`, flag })
    }
  }
  return flags
}
