// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function fmtUsd(n) { return n }
function pad(n) { return String(n).padStart(2, '0') }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function presets() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  return [
    { label: 'This Week', from: iso(startOfWeek), to: iso(now) },
    { label: 'Month to Date', from: iso(startOfMonth), to: iso(now) },
  ]
}

export default function HRTrackReportsPage() {
  const now = new Date()
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(() => iso(now))
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async (fromDate, toDate) => {
    setLoading(true)
    const res = await fetch(`/api/hrtrack/attendance?from=${fromDate}&to=${toDate}`)
    const result = await res.json()
    setRecords(result.records || [])
    setLoading(false)
  }

  useEffect(() => { load(from, to) }, [])

  const byStaff = {}
  for (const r of records) {
    const email = r.users?.email || 'Unknown'
    if (!byStaff[email]) byStaff[email] = { officeDays: 0, remoteDays: 0, totalHours: 0, openSessions: 0 }
    if (r.status === 'office') byStaff[email].officeDays += 1
    else byStaff[email].remoteDays += 1
    if (r.clock_out_at) {
      byStaff[email].totalHours += (new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime()) / (1000 * 60 * 60)
    } else {
      byStaff[email].openSessions += 1
    }
  }
  const rows = Object.entries(byStaff).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">HRTrack Reports</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Attendance summary per staff member over the selected period.</p>

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
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No attendance data for this period.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Staff</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Office Days</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Remote Days</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Total Hours</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Open Sessions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(([email, stats]) => (
                <tr key={email}>
                  <td className="px-4 py-3 text-gray-900">{email}</td>
                  <td className="px-4 py-3 text-gray-700">{stats.officeDays}</td>
                  <td className="px-4 py-3 text-gray-700">{stats.remoteDays}</td>
                  <td className="px-4 py-3 text-gray-700">{stats.totalHours.toFixed(2)}h</td>
                  <td className="px-4 py-3 text-gray-700">{stats.openSessions > 0 ? stats.openSessions : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
