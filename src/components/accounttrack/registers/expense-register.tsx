'use client'

import { useEffect, useState } from 'react'

type Disbursement = {
  id: string
  disb_date: string
  description: string | null
  amount_usd: number
  billed: boolean
  matters: { matter_id: string; case_name: string } | null
  lawyers: { nickname: string } | null
}

export default function ExpenseRegister() {
  const [rows, setRows] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/accounttrack/disbursements')
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) setError(body.error || 'Could not load disbursements')
        else setRows(body.disbursements || [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (rows.length === 0) return <p className="text-gray-500 text-sm">No disbursements yet.</p>

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Matter</th>
            <th className="px-3 py-2 font-medium">Lawyer</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Billed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 text-gray-700">{d.disb_date}</td>
              <td className="px-3 py-2 text-gray-700">{d.matters?.matter_id || '—'}</td>
              <td className="px-3 py-2 text-gray-700">{d.lawyers?.nickname || '—'}</td>
              <td className="px-3 py-2 text-gray-700">{d.description || '—'}</td>
              <td className="px-3 py-2 text-gray-700">${Number(d.amount_usd || 0).toFixed(2)}</td>
              <td className="px-3 py-2 text-gray-500">{d.billed ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
