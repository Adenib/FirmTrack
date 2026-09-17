import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { hasActiveModule } from '@/lib/require-module'
import { loadMatterProfitability, loadClientProfitability } from '@/lib/accounttrack/load-matter-profitability'
import type { MatterProfitability, TimekeeperProfitability } from '@/lib/accounttrack/profitability'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_ROLES = ['owner', 'admin', 'accounts']

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`)

function writeSummarySheet(workbook: ExcelJS.Workbook, title: string, p: MatterProfitability) {
  const sheet = workbook.addWorksheet('Summary')
  sheet.columns = [{ header: 'Metric', key: 'metric', width: 32 }, { header: 'Value', key: 'value', width: 20 }]
  sheet.addRow({ metric: title, value: '' }).font = { bold: true }
  sheet.addRow({ metric: 'Revenue (fees billed)', value: p.revenue })
  sheet.addRow({ metric: 'Time cost', value: p.cost.timeCost })
  sheet.addRow({ metric: 'Expenses', value: p.cost.expenses })
  sheet.addRow({ metric: 'Total cost', value: p.cost.total })
  sheet.addRow({ metric: 'Gross profit', value: p.profit })
  sheet.addRow({ metric: 'Gross margin', value: pct(p.marginPct) })
  sheet.addRow({ metric: 'Fees collected', value: p.feesCollected })
  sheet.addRow({ metric: 'Collection rate', value: pct(p.collectionRate) })
  sheet.addRow({ metric: 'Realisation rate', value: pct(p.realisationRate) })
  sheet.addRow({ metric: 'WIP (unbilled)', value: p.wip })
  sheet.addRow({ metric: 'Write-offs', value: p.writeOffs })
  if (p.budgetComparison) {
    sheet.addRow({ metric: 'Over budget', value: p.budgetComparison.overBudget ? 'Yes' : 'No' })
  }
  if (p.flags.length > 0) {
    sheet.addRow({ metric: '', value: '' })
    sheet.addRow({ metric: 'Flags', value: '' }).font = { bold: true }
    for (const f of p.flags) sheet.addRow({ metric: f.type, value: f.message })
  }
}

function writeTimekeepersSheet(workbook: ExcelJS.Workbook, timekeepers: TimekeeperProfitability[]) {
  const sheet = workbook.addWorksheet('Timekeepers')
  sheet.columns = [
    { header: 'Grade', key: 'category', width: 20 },
    { header: 'Hours', key: 'hours', width: 12 },
    { header: 'Billable hours', key: 'billableHours', width: 16 },
    { header: 'Revenue', key: 'revenue', width: 16 },
    { header: 'Internal cost', key: 'internalCost', width: 16 },
    { header: 'Profit contribution', key: 'profitContribution', width: 20 },
  ]
  for (const t of timekeepers) {
    sheet.addRow({ category: t.category || 'Unassigned', hours: t.hours, billableHours: t.billableHours, revenue: t.revenue, internalCost: t.internalCost, profitContribution: t.profitContribution })
  }
}

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })
  if (!ALLOWED_ROLES.includes(profile.role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matterId')
  const clientId = searchParams.get('clientId')
  if (!matterId && !clientId) {
    return NextResponse.json({ error: 'matterId or clientId is required' }, { status: 400 })
  }

  const workbook = new ExcelJS.Workbook()
  let filename = 'profitability.xlsx'

  if (matterId) {
    const { data: matter } = await supabaseAdmin
      .from('matters').select('id, matter_id, case_name').eq('id', matterId).eq('tenant_id', profile.tenant_id).maybeSingle()
    if (!matter) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })

    const { profitability, timekeepers } = await loadMatterProfitability(profile.tenant_id, matterId)
    writeSummarySheet(workbook, `${matter.matter_id} · ${matter.case_name}`, profitability)
    writeTimekeepersSheet(workbook, timekeepers)
    filename = `profitability-${matter.matter_id}.xlsx`
  } else {
    const { data: client } = await supabaseAdmin
      .from('clients').select('id, name').eq('id', clientId!).eq('tenant_id', profile.tenant_id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const { rollup, matters } = await loadClientProfitability(profile.tenant_id, clientId!)

    const summarySheet = workbook.addWorksheet('Summary')
    summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 32 }, { header: 'Value', key: 'value', width: 20 }]
    summarySheet.addRow({ metric: client.name, value: '' }).font = { bold: true }
    summarySheet.addRow({ metric: 'Revenue (fees billed)', value: rollup.revenue })
    summarySheet.addRow({ metric: 'Total cost', value: rollup.cost.total })
    summarySheet.addRow({ metric: 'Gross profit', value: rollup.profit })
    summarySheet.addRow({ metric: 'Gross margin', value: pct(rollup.marginPct) })
    summarySheet.addRow({ metric: 'Fees collected', value: rollup.feesCollected })
    summarySheet.addRow({ metric: 'Collection rate', value: pct(rollup.collectionRate) })
    summarySheet.addRow({ metric: 'WIP (unbilled)', value: rollup.wip })
    summarySheet.addRow({ metric: 'Write-offs', value: rollup.writeOffs })

    const mattersSheet = workbook.addWorksheet('Matters')
    mattersSheet.columns = [
      { header: 'Matter', key: 'label', width: 30 },
      { header: 'Revenue', key: 'revenue', width: 16 },
      { header: 'Cost', key: 'cost', width: 16 },
      { header: 'Profit', key: 'profit', width: 16 },
      { header: 'Margin', key: 'margin', width: 12 },
      { header: 'Flags', key: 'flags', width: 30 },
    ]
    for (const m of matters) {
      mattersSheet.addRow({
        label: `${m.matter.matter_id} · ${m.matter.case_name}`,
        revenue: m.profitability.revenue,
        cost: m.profitability.cost.total,
        profit: m.profitability.profit,
        margin: pct(m.profitability.marginPct),
        flags: m.profitability.flags.map((f) => f.type).join(', '),
      })
    }
    filename = `profitability-${client.name.replace(/[^a-z0-9]+/gi, '-')}.xlsx`
  }

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
