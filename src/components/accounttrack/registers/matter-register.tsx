'use client'

import { useEffect, useState } from 'react'

type MatterRow = {
  matter: {
    id: string
    matter_id: string
    case_name: string
    client_name: string | null
    status: string
  }
  hours: { billable: number; non_billable: number; total: number }
  unbilled: { hours: number; fees: number; disbursements: number }
  accounts_receivable: number
  trust_balance: number
  retainer_balance: number
}

const PAGE_SIZE = 50

function fmtUsd(n: number) {
  return `₦${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function MatterRegister() {
  const [rows, setRows] = useState<MatterRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), status })
    if (q) params.set('q', q)

    fetch(`/api/accounttrack/matter-register?${params.toString()}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) {
          setError(body.error || 'Could not load matter register')
        } else {
          setRows(body.matters || [])
          setTotalCount(body.total_count || 0)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [q, status, offset])

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="w-64">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOffset(0)
            }}
            placeholder="Matter ID or case name..."
            className="w-full px-2 py-1 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setOffset(0)
            }}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No matters match these filters.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Matter</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Billable Hrs</th>
                <th className="px-3 py-2 font-medium">Non-Bill Hrs</th>
                <th className="px-3 py-2 font-medium">Unbd Fees</th>
                <th className="px-3 py-2 font-medium">Unbd Disb</th>
                <th className="px-3 py-2 font-medium">A/R</th>
                <th className="px-3 py-2 font-medium">Trust</th>
                <th className="px-3 py-2 font-medium">Retainer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.matter.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-900 font-medium">
                    {row.matter.matter_id} · {row.matter.case_name}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{row.matter.client_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{row.hours.billable.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-700">{row.hours.non_billable.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtUsd(row.unbilled.fees)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtUsd(row.unbilled.disbursements)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtUsd(row.accounts_receivable)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtUsd(row.trust_balance)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtUsd(row.retainer_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= totalCount}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
