// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function fmtUsd(n) { return `$${Number(n || 0).toFixed(2)}` }
function pad(n) { return String(n).padStart(2, '0') }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function presets() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  return [
    { label: 'Month to Date', from: iso(startOfMonth), to: iso(now) },
    { label: 'Year to Date', from: iso(startOfYear), to: iso(now) },
  ]
}

export default function TimeTrackReportsPage() {
  const now = new Date()
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(() => iso(now))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async (fromDate, toDate) => {
    setLoading(true)
    const res = await fetch(`/api/timetrack/entries?from=${fromDate}&to=${toDate}&entry_type=timesheet`)
    const result = await res.json()
    setEntries(result.entries || [])
    setLoading(false)
  }

  useEffect(() => { load(from, to) }, [])

  const byLawyer = {}
  let totalHours = 0
  let totalBillable = 0
  let totalAmount = 0
  for (const e of entries) {
    const name = e.lawyers?.nickname || e.lawyers?.initials || 'Unassigned'
    if (!byLawyer[name]) byLawyer[name] = { hours: 0, billableHours: 0, amount: 0 }
    const hours = Number(e.hours || 0)
    byLawyer[name].hours += hours
    totalHours += hours
    if (e.billable !== false) {
      byLawyer[name].billableHours += hours
      byLawyer[name].amount += Number(e.amount_usd || 0)
      totalBillable += hours
      totalAmount += Number(e.amount_usd || 0)
    }
  }
  const rows = Object.entries(byLawyer).sort((a, b) => b[1].hours - a[1].hours)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">TimeTrack Reports</h1>
        <Link href="/timetrack" className="text-sm text-blue-600 hover:underline">← TimeTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Hours logged per lawyer over the selected period.</p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        {presets().map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => { setFrom(p.from); setTo(p.to); load(p.from, p.to) }}
            className="text-xs px-3 py-1.5 border rounded-md hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <button type="button" onClick={() => load(from, to)} className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50">Run</button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Total Hours</p>
              <p className="text-xl font-semibold text-gray-900">{totalHours.toFixed(2)}h</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Billable Hours</p>
              <p className="text-xl font-semibold text-gray-900">{totalBillable.toFixed(2)}h</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Billable Amount</p>
              <p className="text-xl font-semibold text-gray-900">{fmtUsd(totalAmount)}</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-gray-500 text-sm">No time entries for this period.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Lawyer</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Total Hours</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Billable Hours</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Billable Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(([name, stats]) => (
                    <tr key={name}>
                      <td className="px-4 py-3 text-gray-900">{name}</td>
                      <td className="px-4 py-3 text-gray-700">{stats.hours.toFixed(2)}h</td>
                      <td className="px-4 py-3 text-gray-700">{stats.billableHours.toFixed(2)}h</td>
                      <td className="px-4 py-3 text-gray-700">{fmtUsd(stats.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
