'use client'

import { useEffect, useState } from 'react'

type Entry = {
  id: string
  entry_date: string
  hours: number
  rate: number
  amount: number
  billable: boolean
  status: string
  matters: { matter_id: string; case_name: string } | null
  lawyers: { nickname: string } | null
  task_codes: { code: string } | null
}

export default function TimeRegister() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/timetrack/entries')
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) setError(body.error || 'Could not load time entries')
        else setEntries(body.entries || [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (entries.length === 0) return <p className="text-gray-500 text-sm">No time entries yet.</p>

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Matter</th>
            <th className="px-3 py-2 font-medium">Lawyer</th>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Hours</th>
            <th className="px-3 py-2 font-medium">Rate</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Billable</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 text-gray-700">{e.entry_date}</td>
              <td className="px-3 py-2 text-gray-700">{e.matters?.matter_id || '—'}</td>
              <td className="px-3 py-2 text-gray-700">{e.lawyers?.nickname || '—'}</td>
              <td className="px-3 py-2 text-gray-700">{e.task_codes?.code || '—'}</td>
              <td className="px-3 py-2 text-gray-700">{Number(e.hours || 0).toFixed(2)}</td>
              <td className="px-3 py-2 text-gray-700">{Number(e.rate || 0).toFixed(2)}</td>
              <td className="px-3 py-2 text-gray-700">{Number(e.amount || 0).toFixed(2)}</td>
              <td className="px-3 py-2 text-gray-500">{e.billable === false ? 'No' : 'Yes'}</td>
              <td className="px-3 py-2">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
                  {e.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
