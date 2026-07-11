'use client'

import { useEffect, useState } from 'react'

type Account = { id: string; code: string | null; name: string; account_type: string }
type LedgerLine = {
  id: string
  debit_usd: number
  credit_usd: number
  description: string | null
  running_balance: number
  journal_entries: { entry_date: string; description: string | null; source_type: string }
}

function fmtUsd(n: number) {
  return `$${Number(n || 0).toFixed(2)}`
}

export default function LedgerRegister() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [lines, setLines] = useState<LedgerLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/accounttrack/chart-of-accounts')
      .then((r) => r.json())
      .then((body) => setAccounts(body.accounts || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!accountId) {
      setLines([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/accounttrack/journal-entries?account_id=${accountId}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) setError(body.error || 'Could not load ledger')
        else setLines(body.lines || [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [accountId])

  return (
    <div>
      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Account</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="px-2 py-1 border rounded text-sm w-72"
        >
          <option value="">Select an account...</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code ? `${a.code} · ` : ''}{a.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {!accountId ? (
        <p className="text-gray-500 text-sm">Select an account to view its ledger.</p>
      ) : loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : lines.length === 0 ? (
        <p className="text-gray-500 text-sm">No activity posted to this account yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Debit</th>
                <th className="px-3 py-2 font-medium">Credit</th>
                <th className="px-3 py-2 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-700">{line.journal_entries.entry_date}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {line.description || line.journal_entries.description || '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    {Number(line.debit_usd) > 0 ? fmtUsd(line.debit_usd) : ''}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    {Number(line.credit_usd) > 0 ? fmtUsd(line.credit_usd) : ''}
                  </td>
                  <td className="px-3 py-2 text-gray-900 font-medium">{fmtUsd(line.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
