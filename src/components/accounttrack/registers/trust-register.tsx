'use client'

import { useEffect, useState } from 'react'

type LedgerEntry = {
  id: string
  entry_date: string
  ledger_type: 'trust' | 'retainer'
  amount_usd: number
  description: string | null
  matters: { matter_id: string; case_name: string } | null
}

export default function TrustRegister() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/accounttrack/trust-ledger')
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) setError(body.error || 'Could not load trust ledger')
        else setEntries(body.entries || [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (entries.length === 0) return <p className="text-gray-500 text-sm">No trust/retainer entries yet.</p>

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Matter</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 text-gray-700">{e.entry_date}</td>
              <td className="px-3 py-2 text-gray-700">{e.matters?.matter_id || '—'}</td>
              <td className="px-3 py-2 text-gray-700 capitalize">{e.ledger_type}</td>
              <td className="px-3 py-2 text-gray-700">{e.description || '—'}</td>
              <td className={`px-3 py-2 ${Number(e.amount_usd) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                ₦{Number(e.amount_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
