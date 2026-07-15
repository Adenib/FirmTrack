// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function fmtUsd(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}
function iso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function presets() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const startOfLastMonth = new Date(endOfLastMonth.getFullYear(), endOfLastMonth.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31)
  const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1)

  return [
    { label: 'Month to Date', from: iso(startOfMonth), to: iso(now) },
    { label: 'Last Month', from: iso(startOfLastMonth), to: iso(endOfLastMonth) },
    { label: 'Year to Date', from: iso(startOfYear), to: iso(now) },
    { label: 'Last Year', from: iso(startOfLastYear), to: iso(endOfLastYear) },
  ]
}

export default function BillTrackReportsPage() {
  const now = new Date()
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(() => iso(now))
  const [buckets, setBuckets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const run = async (fromDate, toDate) => {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/billtrack/reports?from=${fromDate}&to=${toDate}`)
    const result = await res.json()
    if (res.ok) {
      setBuckets(result.buckets || [])
      setSummary(result.summary || null)
    } else {
      setError(result.error || 'Could not load report')
    }
    setLoading(false)
  }

  useEffect(() => {
    run(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chartData = buckets.map((b) => ({
    label: b.label,
    Sent: Number(b.sentUsd.toFixed(2)),
    Pending: Number(b.pendingUsd.toFixed(2)),
    Paid: Number(b.paidUsd.toFixed(2)),
  }))

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">BillTrack Reports</h1>
        <Link href="/billtrack" className="text-sm text-blue-600 hover:underline">
          ← BillTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Bills sent, unbilled work in progress, and payments received over time, firmwide.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        {presets().map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setFrom(p.from)
              setTo(p.to)
              run(p.from, p.to)
            }}
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
        <button type="button" onClick={() => run(from, to)} className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50">
          Run
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Bills Sent</p>
                <p className="text-xl font-semibold text-gray-900">{fmtUsd(summary.sentUsd)}</p>
                <p className="text-xs text-gray-500">{summary.sentCount} invoice{summary.sentCount === 1 ? '' : 's'}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Pending (WIP)</p>
                <p className="text-xl font-semibold text-gray-900">{fmtUsd(summary.pendingUsd)}</p>
                <p className="text-xs text-gray-500">Unbilled time &amp; disbursements</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Paid</p>
                <p className="text-xl font-semibold text-gray-900">{fmtUsd(summary.paidUsd)}</p>
                <p className="text-xs text-gray-500">Payments recorded in period</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Total Billed</p>
                <p className="text-xl font-semibold text-gray-900">{fmtUsd(summary.sentUsd)}</p>
                <p className="text-xs text-gray-500">Total invoiced in period</p>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-4" style={{ height: 360 }}>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-500">No data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => fmtUsd(value)} />
                  <Legend />
                  <Bar dataKey="Sent" fill="#2563eb" />
                  <Bar dataKey="Pending" fill="#f59e0b" />
                  <Bar dataKey="Paid" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  )
}
