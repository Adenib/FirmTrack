'use client'

import { useEffect, useState } from 'react'

type MatterSummary = {
  matter: { matter_id: string; case_name: string; re_line: string | null; client_name: string | null }
  hours: { billable: number; non_billable: number; total: number }
  amount_total: number
  unbilled: { hours: number; fees: number; disbursements: number }
  accounts_receivable: number
  trust_balance: number
  retainer_balance: number
}

function fmtHours(h: number) {
  return `${Number(h || 0).toFixed(2)}h`
}

function fmtUsd(n: number) {
  return `₦${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  )
}

export default function MatterSummaryCard({ matterId }: { matterId: string }) {
  const [summary, setSummary] = useState<MatterSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!matterId) {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/timetrack/matter-summary?matter_id=${matterId}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) {
          setError(body.error || 'Could not load matter summary')
          setSummary(null)
        } else {
          setSummary(body)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [matterId])

  if (!matterId) return null
  if (loading) return <p className="text-sm text-gray-500 mb-4">Loading matter summary...</p>
  if (error) return <p className="text-sm text-red-600 mb-4">{error}</p>
  if (!summary) return null

  return (
    <div id="matter-summary-print-area" className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-gray-900">Matter Summary</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="text-xs text-blue-600 hover:underline print:hidden"
        >
          Print
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pb-4 border-b border-gray-100">
        <Cell label="Non-Billable" value={fmtHours(summary.hours.non_billable)} />
        <Cell label="Billable" value={fmtHours(summary.hours.billable)} />
        <Cell label="Total Hours" value={fmtHours(summary.hours.total)} />
        <Cell label="Amount" value={fmtUsd(summary.amount_total)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 pb-4 border-b border-gray-100">
        <Cell label="Matter" value={summary.matter.matter_id} />
        <Cell label="Client" value={summary.matter.client_name || '—'} />
        <Cell label="Name" value={summary.matter.case_name} />
        <Cell label="Re Line" value={summary.matter.re_line || '—'} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 pb-4 border-b border-gray-100">
        <Cell label="Unbd D" value={fmtUsd(summary.unbilled.disbursements)} />
        <Cell label="Unbd Hrs" value={fmtHours(summary.unbilled.hours)} />
        <Cell label="Unbd Fees" value={fmtUsd(summary.unbilled.fees)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Cell label="A/R" value={fmtUsd(summary.accounts_receivable)} />
        <Cell label="Gen Rtnr" value={fmtUsd(summary.retainer_balance)} />
        <Cell label="Trust" value={fmtUsd(summary.trust_balance)} />
      </div>
    </div>
  )
}
