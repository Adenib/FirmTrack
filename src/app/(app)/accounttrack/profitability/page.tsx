'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import MatterSearchInput, { type MatterResult } from '@/components/timetrack/matter-search-input'

type Flag = { type: string; message: string }

type MatterProfitability = {
  revenue: number
  cost: { timeCost: number; expenses: number; total: number }
  profit: number
  marginPct: number | null
  feesCollected: number
  collectionRate: number | null
  recordedBillableValue: number
  invoicedBillableValue: number
  realisationRate: number | null
  wip: number
  wipAging: { current: number; days30: number; days60: number; days90Plus: number }
  writeOffs: number
  missingCostRateEntryCount: number
  budgetComparison: {
    targetHours: number | null; actualHours: number
    targetBillableHours: number | null; actualBillableHours: number
    targetCost: number | null; actualCost: number
    overBudget: boolean
  } | null
  flags: Flag[]
}

type Timekeeper = {
  lawyerId: string
  category: string | null
  hours: number
  billableHours: number
  revenue: number
  internalCost: number
  profitContribution: number
}

type ClientResult = { id: string; name: string; company: string | null }

type FirmwideAlert = { matterId: string; matterLabel: string; flag: Flag }

const fmt = (n: number) => new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(n)
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`)

const FLAG_LABEL: Record<string, string> = {
  over_budget: 'Over budget',
  excessive_partner_time: 'Excessive partner-grade time',
  significant_write_offs: 'Significant write-offs',
  aged_invoice: 'Aged invoice',
}

function KpiTiles({ p }: { p: MatterProfitability | { revenue: number; cost: { total: number }; profit: number; marginPct: number | null; feesCollected: number; collectionRate: number | null; wip: number; writeOffs: number } }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500">Revenue</p>
        <p className="text-lg font-semibold text-gray-900">{fmt(p.revenue)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500">Cost</p>
        <p className="text-lg font-semibold text-gray-900">{fmt(p.cost.total)}</p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-600">Profit</p>
        <p className="text-lg font-semibold text-blue-700">{fmt(p.profit)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500">Margin</p>
        <p className="text-lg font-semibold text-gray-900">{pct(p.marginPct)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500">Collection rate</p>
        <p className="text-lg font-semibold text-gray-900">{pct(p.collectionRate)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500">WIP</p>
        <p className="text-lg font-semibold text-gray-900">{fmt(p.wip)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500">Write-offs</p>
        <p className="text-lg font-semibold text-gray-900">{fmt(p.writeOffs)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500">Fees collected</p>
        <p className="text-lg font-semibold text-gray-900">{fmt(p.feesCollected)}</p>
      </div>
    </div>
  )
}

function FlagBadges({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {flags.map((f, i) => (
        <span key={i} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full" title={f.message}>
          {FLAG_LABEL[f.type] || f.type}
        </span>
      ))}
    </div>
  )
}

export default function ProfitabilityPage() {
  const [view, setView] = useState<'client' | 'matter' | 'team'>('client')
  const [alerts, setAlerts] = useState<FirmwideAlert[]>([])

  useEffect(() => {
    fetch('/api/accounttrack/profitability/alerts').then((r) => r.json()).then((d) => setAlerts(d.alerts || []))
  }, [])

  // -- By Client --
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<ClientResult[]>([])
  const [clientOpen, setClientOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [clientData, setClientData] = useState<{ rollup: MatterProfitability; matters: { matterId: string; matter_id: string; case_name: string; profitability: MatterProfitability }[] } | null>(null)
  const [clientLoading, setClientLoading] = useState(false)
  const clientDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (clientDebounce.current) clearTimeout(clientDebounce.current)
    if (!clientQuery) { setClientResults([]); return }
    clientDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/clients/search?q=${encodeURIComponent(clientQuery)}`)
      if (!res.ok) return
      const body = await res.json()
      setClientResults(body.clients || [])
    }, 250)
  }, [clientQuery])

  const loadClientProfitability = async (client: ClientResult) => {
    setSelectedClient(client)
    setClientQuery(`${client.name}${client.company ? ` (${client.company})` : ''}`)
    setClientOpen(false)
    setClientLoading(true)
    const res = await fetch(`/api/accounttrack/profitability/client/${client.id}`)
    const body = await res.json()
    setClientData(res.ok ? body : null)
    setClientLoading(false)
  }

  // -- By Matter --
  const [matterQuery, setMatterQuery] = useState('')
  const [selectedMatter, setSelectedMatter] = useState<MatterResult | null>(null)
  const [matterData, setMatterData] = useState<{ profitability: MatterProfitability; timekeepers: Timekeeper[] } | null>(null)
  const [matterLoading, setMatterLoading] = useState(false)
  const [trend, setTrend] = useState<{ period: string; profitability: MatterProfitability }[]>([])

  const loadMatterProfitability = async (matter: MatterResult) => {
    setSelectedMatter(matter)
    setMatterQuery(`${matter.matter_id} · ${matter.case_name}`)
    setMatterLoading(true)
    const [profRes, trendRes] = await Promise.all([
      fetch(`/api/accounttrack/profitability/matter/${matter.id}`),
      fetch(`/api/accounttrack/profitability/trend?matterId=${matter.id}&groupBy=month`),
    ])
    const profBody = await profRes.json()
    const trendBody = await trendRes.json()
    setMatterData(profRes.ok ? profBody : null)
    setTrend(trendRes.ok ? trendBody.trend || [] : [])
    setMatterLoading(false)
  }

  // -- By Partner/Team --
  const [teamGroupBy, setTeamGroupBy] = useState<'responsible_lawyer' | 'law_type'>('responsible_lawyer')
  const [teamGroups, setTeamGroups] = useState<{ group: string; revenue: number; cost: number; profit: number; marginPct: number | null; matterCount: number }[]>([])
  const [teamLoading, setTeamLoading] = useState(false)

  useEffect(() => {
    if (view !== 'team') return
    setTeamLoading(true)
    fetch(`/api/accounttrack/profitability/team?groupBy=${teamGroupBy}`)
      .then((r) => r.json())
      .then((d) => setTeamGroups(d.groups || []))
      .finally(() => setTeamLoading(false))
  }, [view, teamGroupBy])

  const exportUrl = selectedMatter
    ? `/api/accounttrack/profitability/export?matterId=${selectedMatter.id}`
    : selectedClient
    ? `/api/accounttrack/profitability/export?clientId=${selectedClient.id}`
    : null

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Profitability</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">← AccountTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Revenue, internal cost, margin, and realisation by client, matter, and timekeeper.</p>

      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-amber-800 mb-2">{alerts.length} matter{alerts.length === 1 ? '' : 's'} flagged</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {alerts.map((a, i) => (
              <p key={i} className="text-xs text-amber-700">
                <span className="font-medium">{a.matterLabel}</span> — {FLAG_LABEL[a.flag.type] || a.flag.type}: {a.flag.message}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {(['client', 'matter', 'team'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-xs px-3 py-1 rounded-full border ${
              view === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {v === 'client' ? 'By Client' : v === 'matter' ? 'By Matter' : 'By Partner / Team'}
          </button>
        ))}
      </div>

      {view === 'client' && (
        <div>
          <div className="relative mb-4 max-w-md">
            <input
              type="text"
              value={clientQuery}
              placeholder="Search client..."
              onChange={(e) => { setClientQuery(e.target.value); setSelectedClient(null); setClientData(null) }}
              onFocus={() => setClientOpen(true)}
              onBlur={() => setTimeout(() => setClientOpen(false), 150)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {clientOpen && clientResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
                {clientResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => loadClientProfitability(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.company && <p className="text-xs text-gray-500">{c.company}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {clientLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : clientData ? (
            <>
              <KpiTiles p={clientData.rollup} />
              {exportUrl && (
                <a href={exportUrl} className="inline-block text-sm text-blue-600 hover:underline mb-4">Export to Excel</a>
              )}
              <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-4 py-2 font-medium">Matter</th>
                      <th className="px-4 py-2 font-medium">Revenue</th>
                      <th className="px-4 py-2 font-medium">Cost</th>
                      <th className="px-4 py-2 font-medium">Profit</th>
                      <th className="px-4 py-2 font-medium">Margin</th>
                      <th className="px-4 py-2 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientData.matters.map((m) => (
                      <tr key={m.matterId} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 text-gray-700">{m.matter_id} · {m.case_name}</td>
                        <td className="px-4 py-2 text-gray-700">{fmt(m.profitability.revenue)}</td>
                        <td className="px-4 py-2 text-gray-700">{fmt(m.profitability.cost.total)}</td>
                        <td className="px-4 py-2 text-gray-700">{fmt(m.profitability.profit)}</td>
                        <td className="px-4 py-2 text-gray-700">{pct(m.profitability.marginPct)}</td>
                        <td className="px-4 py-2">
                          {m.profitability.flags.length > 0 ? (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">{m.profitability.flags.length}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-gray-500">Search for a client to see their profitability.</p>
          )}
        </div>
      )}

      {view === 'matter' && (
        <div>
          <div className="mb-4 max-w-md">
            <MatterSearchInput
              value={matterQuery}
              onChange={(v) => { setMatterQuery(v); if (!v) { setSelectedMatter(null); setMatterData(null) } }}
              onSelect={loadMatterProfitability}
              placeholder="Search matter..."
            />
          </div>

          {matterLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : matterData ? (
            <>
              <FlagBadges flags={matterData.profitability.flags} />
              <KpiTiles p={matterData.profitability} />
              {exportUrl && (
                <a href={exportUrl} className="inline-block text-sm text-blue-600 hover:underline mb-4">Export to Excel</a>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900 mb-2">Realisation & WIP aging</p>
                  <p className="text-sm text-gray-600">Realisation rate: <span className="font-medium text-gray-900">{pct(matterData.profitability.realisationRate)}</span></p>
                  <p className="text-sm text-gray-600">Recorded billable value: <span className="font-medium text-gray-900">{fmt(matterData.profitability.recordedBillableValue)}</span></p>
                  {matterData.profitability.missingCostRateEntryCount > 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      {matterData.profitability.missingCostRateEntryCount} time entr{matterData.profitability.missingCostRateEntryCount === 1 ? 'y has' : 'ies have'} no internal cost rate configured — cost may be understated.
                    </p>
                  )}
                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    <p>Current: {fmt(matterData.profitability.wipAging.current)}</p>
                    <p>30–59 days: {fmt(matterData.profitability.wipAging.days30)}</p>
                    <p>60–89 days: {fmt(matterData.profitability.wipAging.days60)}</p>
                    <p>90+ days: {fmt(matterData.profitability.wipAging.days90Plus)}</p>
                  </div>
                </div>

                {matterData.profitability.budgetComparison && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-900 mb-2">Budget vs. actual</p>
                    {matterData.profitability.budgetComparison.targetHours != null && (
                      <p className="text-sm text-gray-600">Hours: <span className="font-medium text-gray-900">{matterData.profitability.budgetComparison.actualHours}</span> / {matterData.profitability.budgetComparison.targetHours}</p>
                    )}
                    {matterData.profitability.budgetComparison.targetBillableHours != null && (
                      <p className="text-sm text-gray-600">Billable hours: <span className="font-medium text-gray-900">{matterData.profitability.budgetComparison.actualBillableHours}</span> / {matterData.profitability.budgetComparison.targetBillableHours}</p>
                    )}
                    {matterData.profitability.budgetComparison.targetCost != null && (
                      <p className="text-sm text-gray-600">Cost: <span className="font-medium text-gray-900">{fmt(matterData.profitability.budgetComparison.actualCost)}</span> / {fmt(matterData.profitability.budgetComparison.targetCost)}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto mb-6">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-4 py-2 font-medium">Grade</th>
                      <th className="px-4 py-2 font-medium">Hours</th>
                      <th className="px-4 py-2 font-medium">Billable hours</th>
                      <th className="px-4 py-2 font-medium">Revenue</th>
                      <th className="px-4 py-2 font-medium">Internal cost</th>
                      <th className="px-4 py-2 font-medium">Profit contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matterData.timekeepers.map((t) => (
                      <tr key={t.lawyerId} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2 text-gray-700">{t.category || 'Unassigned'}</td>
                        <td className="px-4 py-2 text-gray-700">{t.hours}</td>
                        <td className="px-4 py-2 text-gray-700">{t.billableHours}</td>
                        <td className="px-4 py-2 text-gray-700">{fmt(t.revenue)}</td>
                        <td className="px-4 py-2 text-gray-700">{fmt(t.internalCost)}</td>
                        <td className="px-4 py-2 text-gray-700">{fmt(t.profitContribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {trend.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900 mb-3">Monthly trend</p>
                  <div className="flex items-end gap-2 h-32">
                    {trend.map((t) => {
                      const maxProfit = Math.max(...trend.map((x) => Math.abs(x.profitability.profit)), 1)
                      const heightPct = Math.max(4, (Math.abs(t.profitability.profit) / maxProfit) * 100)
                      return (
                        <div key={t.period} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={`w-full rounded-t ${t.profitability.profit >= 0 ? 'bg-blue-500' : 'bg-red-400'}`}
                            style={{ height: `${heightPct}%` }}
                            title={`${t.period}: ${fmt(t.profitability.profit)}`}
                          />
                          <span className="text-[10px] text-gray-400">{t.period.slice(5)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500">Search for a matter to see its profitability.</p>
          )}
        </div>
      )}

      {view === 'team' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setTeamGroupBy('responsible_lawyer')}
              className={`text-xs px-3 py-1 rounded-full border ${teamGroupBy === 'responsible_lawyer' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'}`}
            >
              By Partner
            </button>
            <button
              onClick={() => setTeamGroupBy('law_type')}
              className={`text-xs px-3 py-1 rounded-full border ${teamGroupBy === 'law_type' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'}`}
            >
              By Practice Group
            </button>
          </div>

          {teamLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : teamGroups.length === 0 ? (
            <p className="text-gray-500">No matters yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">{teamGroupBy === 'responsible_lawyer' ? 'Responsible Partner' : 'Practice Group'}</th>
                    <th className="px-4 py-2 font-medium">Matters</th>
                    <th className="px-4 py-2 font-medium">Revenue</th>
                    <th className="px-4 py-2 font-medium">Cost</th>
                    <th className="px-4 py-2 font-medium">Profit</th>
                    <th className="px-4 py-2 font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {teamGroups.map((g) => (
                    <tr key={g.group} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-gray-900">{g.group}</td>
                      <td className="px-4 py-2 text-gray-700">{g.matterCount}</td>
                      <td className="px-4 py-2 text-gray-700">{fmt(g.revenue)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmt(g.cost)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmt(g.profit)}</td>
                      <td className="px-4 py-2 text-gray-700">{pct(g.marginPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
