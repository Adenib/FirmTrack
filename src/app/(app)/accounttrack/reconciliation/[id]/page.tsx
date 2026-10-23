// @ts-nocheck
'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'

const STATUS_COLOR = {
  unmatched: 'bg-amber-100 text-amber-700',
  matched: 'bg-green-100 text-green-700',
  ignored: 'bg-gray-100 text-gray-500',
}

export default function ReconciliationDetailPage({ params }) {
  const { id } = use(params)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyLineId, setBusyLineId] = useState(null)

  const [showAddLine, setShowAddLine] = useState(false)
  const [lineDate, setLineDate] = useState('')
  const [lineDescription, setLineDescription] = useState('')
  const [lineAmount, setLineAmount] = useState('')
  const [lineReference, setLineReference] = useState('')
  const [addingLine, setAddingLine] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/accounttrack/reconciliation/imports/${id}`)
    const result = await res.json()
    if (res.ok) setData(result)
    else setError(result.error || 'Could not load this import')
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const handleAddLine = async (e) => {
    e.preventDefault()
    setAddingLine(true)
    setError('')
    const res = await fetch(`/api/accounttrack/reconciliation/imports/${id}/lines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ line_date: lineDate, description: lineDescription, amount: Number(lineAmount), reference: lineReference }),
    })
    const result = await res.json()
    setAddingLine(false)
    if (!res.ok) {
      setError(result.error || 'Could not add line')
      return
    }
    setShowAddLine(false)
    setLineDate('')
    setLineDescription('')
    setLineAmount('')
    setLineReference('')
    await load()
  }

  const handleConfirmMatch = async (statementLineId, journalLineId) => {
    setBusyLineId(statementLineId)
    setError('')
    const res = await fetch('/api/accounttrack/reconciliation/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statement_line_id: statementLineId, journal_line_id: journalLineId }),
    })
    const result = await res.json()
    setBusyLineId(null)
    if (!res.ok) {
      setError(result.error || 'Could not confirm match')
      return
    }
    await load()
  }

  const handleSetStatus = async (statementLineId, status) => {
    setBusyLineId(statementLineId)
    setError('')
    const res = await fetch('/api/accounttrack/reconciliation/match', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statement_line_id: statementLineId, status }),
    })
    const result = await res.json()
    setBusyLineId(null)
    if (!res.ok) {
      setError(result.error || 'Could not update line')
      return
    }
    await load()
  }

  if (loading) return <div className="p-8"><p className="text-gray-500 text-sm">Loading...</p></div>
  if (!data) return <div className="p-8"><p className="text-red-600 text-sm">{error || 'Not found'}</p></div>

  const { import: imp, lines } = data
  const matchedCount = lines.filter((l) => l.status === 'matched').length
  const ignoredCount = lines.filter((l) => l.status === 'ignored').length
  const unmatchedLines = lines.filter((l) => l.status === 'unmatched')
  const unmatchedTotal = unmatchedLines.reduce((sum, l) => sum + Number(l.amount), 0)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">
          {imp.chart_of_accounts?.name} — {imp.statement_start} to {imp.statement_end}
        </h1>
        <Link href="/accounttrack/reconciliation" className="text-sm text-blue-600 hover:underline">← Reconciliation</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Opening</p>
          <p className="font-semibold text-gray-900">₦{Number(imp.opening_balance).toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Closing</p>
          <p className="font-semibold text-gray-900">₦{Number(imp.closing_balance).toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Matched / Ignored</p>
          <p className="font-semibold text-gray-900">{matchedCount} / {ignoredCount} of {lines.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Still unaccounted for</p>
          <p className={`font-semibold ${unmatchedLines.length ? 'text-amber-700' : 'text-green-700'}`}>
            ₦{unmatchedTotal.toLocaleString()} {unmatchedLines.length === 0 && '✓'}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Statement lines</h2>
        <button onClick={() => setShowAddLine((v) => !v)} className="text-sm border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50">
          {showAddLine ? 'Cancel' : 'Add line manually'}
        </button>
      </div>

      {showAddLine && (
        <form onSubmit={handleAddLine} className="bg-white border border-gray-200 rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
          <input type="date" required value={lineDate} onChange={(e) => setLineDate(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
          <input type="number" step="0.01" required placeholder="Amount (+ deposit / - withdrawal)" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
          <input placeholder="Description" value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} className="px-3 py-2 border rounded-md text-sm col-span-2" />
          <input placeholder="Reference (optional)" value={lineReference} onChange={(e) => setLineReference(e.target.value)} className="px-3 py-2 border rounded-md text-sm col-span-2" />
          <button type="submit" disabled={addingLine} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 col-span-2">
            {addingLine ? 'Adding...' : 'Add line'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="font-medium text-gray-900">{line.description || '(no description)'}</p>
                <p className="text-xs text-gray-500">{line.line_date} {line.reference && `· ${line.reference}`}</p>
              </div>
              <p className={`font-medium ${Number(line.amount) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                ₦{Number(line.amount).toLocaleString()}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded capitalize ${STATUS_COLOR[line.status]}`}>{line.status}</span>
            </div>

            {line.status === 'unmatched' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                {line.suggestions?.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">Suggested matches:</p>
                    {line.suggestions.map((s) => (
                      <div key={s.journalLineId} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-1.5">
                        <span className="text-xs text-gray-700">{s.entryDate} — {s.description || '(no description)'}</span>
                        <button
                          onClick={() => handleConfirmMatch(line.id, s.journalLineId)}
                          disabled={busyLineId === line.id}
                          className="text-xs bg-green-600 text-white px-2.5 py-1 rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                          Confirm match
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No candidate ledger entries found for this amount/date.</p>
                )}
                <button
                  onClick={() => handleSetStatus(line.id, 'ignored')}
                  disabled={busyLineId === line.id}
                  className="text-xs text-gray-500 hover:underline mt-2 disabled:opacity-50"
                >
                  Mark as ignored (e.g. a bank fee not yet posted)
                </button>
              </div>
            )}

            {line.status === 'matched' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleSetStatus(line.id, 'unmatched')}
                  disabled={busyLineId === line.id}
                  className="text-xs text-gray-500 hover:underline disabled:opacity-50"
                >
                  Unmatch
                </button>
              </div>
            )}

            {line.status === 'ignored' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleSetStatus(line.id, 'unmatched')}
                  disabled={busyLineId === line.id}
                  className="text-xs text-gray-500 hover:underline disabled:opacity-50"
                >
                  Unignore
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
