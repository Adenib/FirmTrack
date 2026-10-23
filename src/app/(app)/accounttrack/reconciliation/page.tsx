// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const TEMPLATE_CSV = 'date,description,amount,reference\n2026-10-01,Client wire transfer,15000.00,WIRE-00291\n2026-10-03,Office rent,-4000.00,CHK-1042'

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/"/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))
  })
}

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showNew, setShowNew] = useState(false)
  const [statementStart, setStatementStart] = useState('')
  const [statementEnd, setStatementEnd] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [csvRows, setCsvRows] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const loadAccounts = async () => {
    const res = await fetch('/api/accounttrack/chart-of-accounts?cash_only=1')
    const result = await res.json()
    if (res.ok) {
      setAccounts(result.accounts || [])
      if (result.accounts?.length && !accountId) setAccountId(result.accounts[0].id)
    }
  }

  const loadImports = async (forAccountId) => {
    if (!forAccountId) return
    setLoading(true)
    const res = await fetch(`/api/accounttrack/reconciliation/imports?account_id=${forAccountId}`)
    const result = await res.json()
    if (res.ok) setImports(result.imports || [])
    else setError(result.error || 'Could not load imports')
    setLoading(false)
  }

  useEffect(() => { loadAccounts() }, [])
  useEffect(() => { loadImports(accountId) }, [accountId])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      setCsvRows(rows.map((r) => ({
        line_date: r.date || r.Date || '',
        description: r.description || r.Description || '',
        amount: Number(r.amount || r.Amount || 0),
        reference: r.reference || r.Reference || '',
      })))
    }
    reader.readAsText(file)
  }

  const handleCreateImport = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/accounttrack/reconciliation/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        statement_start: statementStart,
        statement_end: statementEnd,
        opening_balance: Number(openingBalance),
        closing_balance: Number(closingBalance),
        lines: csvRows,
      }),
    })
    const result = await res.json()
    setSubmitting(false)
    if (!res.ok) {
      setError(result.error || 'Could not create import')
      return
    }
    setShowNew(false)
    setStatementStart('')
    setStatementEnd('')
    setOpeningBalance('')
    setClosingBalance('')
    setCsvRows([])
    await loadImports(accountId)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">← AccountTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">
        Import a bank statement for any cash/bank account and match it against what's already posted.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <label className="block text-xs font-medium text-gray-500 mb-1">Account</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm w-full sm:w-80"
        >
          {accounts.length === 0 && <option value="">No cash/bank accounts yet</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ''}{a.name}</option>
          ))}
        </select>
        {accounts.length === 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Flag an account as a cash/bank account in{' '}
            <Link href="/accounttrack/chart-of-accounts" className="text-blue-600 hover:underline">Chart of Accounts</Link> first.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Statement imports</h2>
        <button
          onClick={() => setShowNew((v) => !v)}
          disabled={!accountId}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {showNew ? 'Cancel' : 'New import'}
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreateImport} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Statement start</label>
              <input type="date" required value={statementStart} onChange={(e) => setStatementStart(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Statement end</label>
              <input type="date" required value={statementEnd} onChange={(e) => setStatementEnd(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Opening balance</label>
              <input type="number" step="0.01" required value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Closing balance</label>
              <input type="number" step="0.01" required value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Statement CSV (optional — columns: date, description, amount, reference)
            </label>
            <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              Amount: positive for deposits, negative for withdrawals. Example: <code className="bg-gray-50 px-1 rounded">{TEMPLATE_CSV.split('\n')[0]}</code>
            </p>
            {csvRows.length > 0 && <p className="text-xs text-green-700 mt-1">{csvRows.length} line(s) ready to import.</p>}
            <p className="text-xs text-gray-400 mt-1">No CSV handy? You can add lines one at a time after creating the import.</p>
          </div>

          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create import'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : imports.length === 0 ? (
        <p className="text-gray-500 text-sm">No statements imported for this account yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Period</th>
                <th className="text-right px-4 py-2">Opening</th>
                <th className="text-right px-4 py-2">Closing</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{imp.statement_start} → {imp.statement_end}</td>
                  <td className="px-4 py-2 text-right">₦{Number(imp.opening_balance).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">₦{Number(imp.closing_balance).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/accounttrack/reconciliation/${imp.id}`} className="text-blue-600 hover:underline">Reconcile →</Link>
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
