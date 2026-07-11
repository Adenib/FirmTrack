// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function AccountingPeriodsPage() {
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [periodType, setPeriodType] = useState('month')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const response = await fetch('/api/accounttrack/accounting-periods')
    const result = await response.json()
    if (response.ok) setPeriods(result.periods || [])
    else setError(result.error || 'Could not load accounting periods')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleClose = async (e) => {
    e.preventDefault()
    if (!periodStart || !periodEnd) return
    if (!confirm(`Close this ${periodType} (${periodStart} to ${periodEnd})? ${periodType === 'year' ? 'This posts a real closing entry zeroing revenue/expense into Retained Earnings.' : 'This just locks the period.'}`)) {
      return
    }
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/accounttrack/accounting-periods', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ period_type: periodType, period_start: periodStart, period_end: periodEnd }),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not close period')
      setSubmitting(false)
      return
    }

    setPeriodStart('')
    setPeriodEnd('')
    setSubmitting(false)
    await load()
  }

  const handleReopen = async (id) => {
    if (!confirm('Reopen this period? If it was a year-close, this posts a reversal of the closing entry.')) return
    setError('')
    const response = await fetch('/api/accounttrack/accounting-periods', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not reopen period')
      return
    }
    await load()
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Accounting Periods</h1>
        <Link href="/accounttrack/statements" className="text-sm text-blue-600 hover:underline">
          ← Statements
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Closing a month locks it (no new/edited postings dated inside it). Closing a year
        additionally posts a real closing entry that zeroes revenue/expense into Retained
        Earnings. Owner/admin only.
      </p>

      <form onSubmit={handleClose} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start</label>
          <input
            type="date"
            required
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End</label>
          <input
            type="date"
            required
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Closing...' : `Close ${periodType}`}
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : periods.length === 0 ? (
        <p className="text-gray-500 text-sm">No periods closed yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Start</th>
                <th className="px-3 py-2 font-medium">End</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Closed At</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-700 capitalize">{p.period_type}</td>
                  <td className="px-3 py-2 text-gray-700">{p.period_start}</td>
                  <td className="px-3 py-2 text-gray-700">{p.period_end}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        p.status === 'closed'
                          ? 'text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full'
                          : 'text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full'
                      }
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{p.closed_at ? p.closed_at.split('T')[0] : '—'}</td>
                  <td className="px-3 py-2">
                    {p.status === 'closed' && (
                      <button
                        type="button"
                        onClick={() => handleReopen(p.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
