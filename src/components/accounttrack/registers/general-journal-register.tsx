'use client'

import { useEffect, useState } from 'react'

type JournalLine = {
  id: string
  debit_usd: number
  credit_usd: number
  description: string | null
  chart_of_accounts: { code: string | null; name: string } | null
}

type JournalEntry = {
  id: string
  entry_date: string
  description: string | null
  source_type: string
  lines: JournalLine[]
}

function fmtUsd(n: number) {
  return `$${Number(n || 0).toFixed(2)}`
}

export default function GeneralJournalRegister() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/accounttrack/journal-entries')
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) setError(body.error || 'Could not load general journal')
        else setEntries(body.entries || [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (entries.length === 0) return <p className="text-gray-500 text-sm">No journal entries yet.</p>

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-700">
              {entry.entry_date} · {entry.description || '—'}
            </span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {entry.source_type.replace(/_/g, ' ')}
            </span>
          </div>
          <table className="min-w-full text-sm">
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-0.5 text-gray-700">
                    {line.chart_of_accounts?.code ? `${line.chart_of_accounts.code} · ` : ''}
                    {line.chart_of_accounts?.name || '—'}
                  </td>
                  <td className="py-0.5 text-right text-gray-900 w-24">
                    {Number(line.debit_usd) > 0 ? fmtUsd(line.debit_usd) : ''}
                  </td>
                  <td className="py-0.5 text-right text-gray-900 w-24">
                    {Number(line.credit_usd) > 0 ? fmtUsd(line.credit_usd) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
