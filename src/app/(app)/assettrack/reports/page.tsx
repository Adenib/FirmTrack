// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const label = (value) => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function AssetTrackReportsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/assettrack/reports')
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) setError(body.error || 'Could not load reports')
        else setData(body)
      })
      .finally(() => setLoading(false))
  }, [])

  const fmt = (n) => '₦' + Math.round(n || 0).toLocaleString()

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">AssetTrack Reports</h1>
        <Link href="/assettrack" className="text-sm text-blue-600 hover:underline">← AssetTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Fleet health, repair spend, and turnaround at a glance.</p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : !data ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Open tickets</p>
              <p className="text-2xl font-semibold text-gray-900">{Object.values(data.openByStatus).reduce((a, b) => a + b, 0)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Avg. turnaround</p>
              <p className="text-2xl font-semibold text-gray-900">{data.avgTurnaroundDays != null ? `${data.avgTurnaroundDays.toFixed(1)}d` : '—'}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Overdue ({'>'}{data.slaDays}d)</p>
              <p className="text-2xl font-semibold text-gray-900">{data.overdueTickets.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Retirement candidates</p>
              <p className="text-2xl font-semibold text-gray-900">{data.retirementCandidates.length}</p>
            </div>
          </div>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Open tickets by status</h2>
            {Object.keys(data.openByStatus).length === 0 ? (
              <p className="text-sm text-gray-500">Nothing open.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(data.openByStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{label(status)}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Repair expenditure by category</h2>
            {Object.keys(data.expenditureByCategory).length === 0 ? (
              <p className="text-sm text-gray-500">No recorded repair costs yet.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(data.expenditureByCategory).map(([category, amount]) => (
                  <div key={category} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{label(category)}</span>
                    <span className="font-medium text-gray-900">{fmt(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {Object.keys(data.expenditureByVendor).length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Repair expenditure by vendor</h2>
              <div className="space-y-1.5">
                {Object.entries(data.expenditureByVendor).map(([vendor, amount]) => (
                  <div key={vendor} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{vendor}</span>
                    <span className="font-medium text-gray-900">{fmt(amount)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-2">Internal vs. vendor repairs</h2>
              <p className="text-sm text-gray-700">Internal: {data.internalRepairCount}</p>
              <p className="text-sm text-gray-700">Via vendor: {data.vendorRepairCount}</p>
            </section>
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-2">Warranty vs. paid repairs</h2>
              <p className="text-sm text-gray-700">Under warranty: {data.warrantyRepairCount}</p>
              <p className="text-sm text-gray-700">Paid repairs: {data.nonWarrantyRepairCount}</p>
            </section>
          </div>

          {data.repeatFaults.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Repeat faults (2+ tickets)</h2>
              <div className="space-y-1.5">
                {data.repeatFaults.map((r) => (
                  <div key={r.assetId} className="flex items-center justify-between text-sm">
                    <Link href={`/assettrack/tickets?asset_id=${r.assetId}`} className="text-blue-600 hover:underline">{r.assetTag}</Link>
                    <span className="font-medium text-gray-900">{r.ticketCount} tickets</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.retirementCandidates.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Retirement candidates (older than 3 years)</h2>
              <div className="flex flex-wrap gap-2">
                {data.retirementCandidates.map((a) => (
                  <Link key={a.assetId} href="/assettrack/assets" className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200">
                    {a.assetTag}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.overdueTickets.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Tickets exceeding the {data.slaDays}-day turnaround target</h2>
              <div className="space-y-1.5">
                {data.overdueTickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">AT-{t.id.slice(0, 8).toUpperCase()} — {label(t.status)}</span>
                    <span className="font-medium text-amber-700">{t.daysOpen}d open</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
