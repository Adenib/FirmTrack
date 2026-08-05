// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function fmtAmount(n) {
  return `₦${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtHours(n) {
  return `${Number(n || 0).toFixed(2)}h`
}

function fmtPct(n) {
  return n === null || n === undefined ? '—' : `${(n * 100).toFixed(0)}%`
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function iso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function LawyerOverviewPage() {
  const now = new Date()
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(() => iso(now))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingLawyerId, setEditingLawyerId] = useState(null)
  const [targetHours, setTargetHours] = useState('')
  const [targetBillableHours, setTargetBillableHours] = useState('')
  const [targetRevenue, setTargetRevenue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async (fromDate, toDate) => {
    setLoading(true)
    setError('')
    const response = await fetch(`/api/accounttrack/lawyer-overview?from=${fromDate}&to=${toDate}`)
    const result = await response.json()
    if (response.ok) setRows(result.lawyers || [])
    else setError(result.error || 'Could not load lawyer overview')
    setLoading(false)
  }

  useEffect(() => {
    load(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startEditing = (row) => {
    setEditingLawyerId(row.lawyer.id)
    setTargetHours(row.budget?.target_hours ?? '')
    setTargetBillableHours(row.budget?.target_billable_hours ?? '')
    setTargetRevenue(row.budget?.target_revenue ?? '')
  }

  const saveBudget = async (row) => {
    setSubmitting(true)
    setError('')

    const body = row.budget
      ? {
          id: row.budget.id,
          target_hours: targetHours === '' ? null : Number(targetHours),
          target_billable_hours: targetBillableHours === '' ? null : Number(targetBillableHours),
          target_revenue: targetRevenue === '' ? null : Number(targetRevenue),
        }
      : {
          lawyer_id: row.lawyer.id,
          period_start: from,
          period_end: to,
          target_hours: targetHours === '' ? null : Number(targetHours),
          target_billable_hours: targetBillableHours === '' ? null : Number(targetBillableHours),
          target_revenue: targetRevenue === '' ? null : Number(targetRevenue),
        }

    const response = await fetch('/api/accounttrack/budgets', {
      method: row.budget ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not save budget')
      setSubmitting(false)
      return
    }

    setEditingLawyerId(null)
    setSubmitting(false)
    await load(from, to)
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Lawyer Overview</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">
          ← AccountTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Hours, revenue, and WIP per lawyer for the selected period, against budget targets where set.
        Utilization uses the budget&apos;s target billable hours when available, otherwise falls back to a
        logged-hours ratio (billable ÷ total) — labeled so the two are never confused.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <button type="button" onClick={() => load(from, to)} className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50">
          Run
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No active lawyers found.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.lawyer.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900">{row.lawyer.nickname || row.lawyer.full_name}</p>
                <button
                  type="button"
                  onClick={() => (editingLawyerId === row.lawyer.id ? setEditingLawyerId(null) : startEditing(row))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {editingLawyerId === row.lawyer.id ? 'Cancel' : row.budget ? 'Edit budget' : 'Set budget'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Billable</p>
                  <p className="text-sm text-gray-900">{fmtHours(row.hours.billable)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Non-Billable</p>
                  <p className="text-sm text-gray-900">{fmtHours(row.hours.non_billable)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Revenue</p>
                  <p className="text-sm text-gray-900">{fmtAmount(row.revenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">WIP</p>
                  <p className="text-sm text-gray-900">{fmtAmount(row.wip)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Utilization {row.utilization_basis === 'logged_ratio' ? '(logged ratio)' : row.utilization_basis === 'budget' ? '(vs budget)' : ''}
                  </p>
                  <p className="text-sm text-gray-900">{fmtPct(row.utilization)}</p>
                </div>
              </div>

              {row.budget && (
                <p className="text-xs text-gray-400 mt-2">
                  Target: {row.budget.target_hours ? `${row.budget.target_hours}h total` : ''}
                  {row.budget.target_billable_hours ? ` · ${row.budget.target_billable_hours}h billable` : ''}
                  {row.budget.target_revenue ? ` · ${fmtAmount(row.budget.target_revenue)} revenue` : ''}
                </p>
              )}

              {editingLawyerId === row.lawyer.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Target Total Hrs</label>
                    <input
                      type="number"
                      step="0.01"
                      value={targetHours}
                      onChange={(e) => setTargetHours(e.target.value)}
                      className="w-28 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Target Billable Hrs</label>
                    <input
                      type="number"
                      step="0.01"
                      value={targetBillableHours}
                      onChange={(e) => setTargetBillableHours(e.target.value)}
                      className="w-28 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Target Revenue (₦)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={targetRevenue}
                      onChange={(e) => setTargetRevenue(e.target.value)}
                      className="w-32 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => saveBudget(row)}
                    disabled={submitting}
                    className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
