// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MatterSearchInput from '@/components/timetrack/matter-search-input'

const emptyLine = () => ({
  matter_id: '', matter_query: '', matter_label: '',
  explanation: '', amount: '', account_id: '', description: '', hold: false,
})

export default function NewGeneralCheckPage() {
  const [cashAccounts, setCashAccounts] = useState([])
  const [allAccounts, setAllAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [payee, setPayee] = useState('')
  const [checkNumber, setCheckNumber] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [explanation, setExplanation] = useState('')
  const [lines, setLines] = useState([emptyLine()])

  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lineResults, setLineResults] = useState(null) // trust path only

  useEffect(() => {
    fetch('/api/accounttrack/chart-of-accounts?cash_only=1').then((r) => r.json()).then((r) => setCashAccounts(r.accounts || []))
    fetch('/api/accounttrack/chart-of-accounts').then((r) => r.json()).then((r) => setAllAccounts(r.accounts || []))
    fetch('/api/accounttrack/recurring-templates?transaction_type=general_check').then((r) => r.json()).then((r) => setTemplates(r.templates || []))
  }, [])

  const selectedAccount = cashAccounts.find((a) => a.id === accountId)
  const isTrust = selectedAccount?.key === 'trust_bank'

  const activeLines = lines.filter((l) => !l.hold)
  const total = activeLines.reduce((sum, l) => sum + Number(l.amount || 0), 0)

  const updateLine = (index, patch) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index))

  const applyTemplate = (id) => {
    setSelectedTemplateId(id)
    const template = templates.find((t) => t.id === id)
    if (!template) return
    const payload = template.payload || {}
    setAccountId(payload.account_id || '')
    setPayee(payload.payee || '')
    setExplanation(payload.explanation || '')
    setLines((payload.lines || []).map((l) => ({
      matter_id: l.matter_id || '', matter_query: l.matter_label || '', matter_label: l.matter_label || '',
      explanation: l.explanation || '', amount: '', account_id: l.account_id || '', description: l.description || '', hold: false,
    })))
    fetch('/api/accounttrack/recurring-templates', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, mark_used: true }),
    })
  }

  const canSubmit =
    accountId && payee && activeLines.length > 0 && total > 0 &&
    activeLines.every((l) => Number(l.amount) > 0 && (isTrust ? l.matter_id : l.account_id))

  const saveTemplateIfRequested = async () => {
    if (!saveAsTemplate || !templateName) return
    await fetch('/api/accounttrack/recurring-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: templateName,
        transaction_type: 'general_check',
        payload: {
          account_id: accountId,
          payee,
          explanation,
          lines: activeLines.map((l) => ({ matter_id: l.matter_id, matter_label: l.matter_label, explanation: l.explanation, account_id: l.account_id, description: l.description })),
        },
      }),
    })
  }

  const resetForm = () => {
    setPayee('')
    setCheckNumber('')
    setExplanation('')
    setLines([emptyLine()])
    setSaveAsTemplate(false)
    setTemplateName('')
  }

  const handleSubmitOperating = async () => {
    const reference = checkNumber || `CHK-${date}-${Math.random().toString(36).slice(2, 6)}`
    const res = await fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry_date: date,
        description: `Check to ${payee}${explanation ? `: ${explanation}` : ''}`,
        reference,
        lines: [
          { account_id: accountId, credit: total, description: `Check to ${payee}` },
          ...activeLines.map((l) => ({
            account_id: l.account_id,
            matter_id: l.matter_id || null,
            debit: Number(l.amount),
            description: l.description || l.explanation || null,
          })),
        ],
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not post check')
      return
    }
    await saveTemplateIfRequested()
    setSuccess(`Check posted (${reference}).`)
    resetForm()
  }

  const handleSubmitTrust = async (retryFrom = 0) => {
    const reference = checkNumber || `CHK-${date}-${Math.random().toString(36).slice(2, 6)}`
    const results = retryFrom > 0 && lineResults ? [...lineResults] : activeLines.map((l) => ({ line: l, status: 'not_attempted' }))

    for (let i = retryFrom; i < activeLines.length; i++) {
      const line = activeLines[i]
      const res = await fetch('/api/accounttrack/trust-ledger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matter_id: line.matter_id,
          ledger_type: 'trust',
          entry_date: date,
          amount: -Math.abs(Number(line.amount)),
          description: `Check to ${payee}${line.explanation ? `: ${line.explanation}` : ''}`,
          reference,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        results[i] = { line, status: 'failed', detail: result.error }
        setLineResults(results)
        setError(`Line ${i + 1} failed — stopped. Already-posted lines were not reversed.`)
        return
      }
      results[i] = { line, status: 'success' }
    }

    setLineResults(results)
    await saveTemplateIfRequested()
    setSuccess(`Trust check posted (${reference}) across ${activeLines.length} line(s).`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    setLineResults(null)

    if (isTrust) await handleSubmitTrust(0)
    else await handleSubmitOperating()

    setSubmitting(false)
  }

  const retryRemaining = async () => {
    const nextIndex = lineResults.findIndex((r) => r.status !== 'success')
    if (nextIndex === -1) return
    setSubmitting(true)
    setError('')
    await handleSubmitTrust(nextIndex)
    setSubmitting(false)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">New General Check</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">
          ← AccountTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Pay from Operating Cash, Petty Cash, or Trust — split across multiple matters or accounts in one check.
      </p>

      {templates.length > 0 && (
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Use a recurring template</label>
          <select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)} className="px-2 py-1.5 border rounded text-sm w-64">
            <option value="">— none —</option>
            {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Account</label>
            <select required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
              <option value="">Select account...</option>
              {cashAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Payee</label>
            <input type="text" required value={payee} onChange={(e) => setPayee(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Check # (optional)</label>
            <input type="text" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Explanation</label>
          <input type="text" value={explanation} onChange={(e) => setExplanation(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
        </div>

        {isTrust && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
            Paying from Trust — every line requires a matter, and always reduces that matter's trust balance.
            No G/L account choice here; that's fixed.
          </p>
        )}

        <div className="border border-gray-200 rounded overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Matter{isTrust ? ' (required)' : ' (optional)'}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Explanation</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">Amount</th>
                {!isTrust && <th className="text-left px-3 py-2 font-medium text-gray-500">G/L Account</th>}
                <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">Hold</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className={`border-b border-gray-100 last:border-0 ${line.hold ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 w-56">
                    <MatterSearchInput
                      value={line.matter_query}
                      onChange={(v) => updateLine(i, { matter_query: v, matter_id: v ? line.matter_id : '' })}
                      onSelect={(m) => updateLine(i, { matter_id: m.id, matter_query: `${m.matter_id} · ${m.case_name}`, matter_label: `${m.matter_id} · ${m.case_name}` })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={line.explanation} onChange={(e) => updateLine(i, { explanation: e.target.value })} className="w-full px-2 py-1 border rounded text-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" min="0" value={line.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} className="w-full px-2 py-1 border rounded text-sm text-right" />
                  </td>
                  {!isTrust && (
                    <td className="px-3 py-2">
                      <select value={line.account_id} onChange={(e) => updateLine(i, { account_id: e.target.value })} className="w-full px-2 py-1 border rounded text-sm">
                        <option value="">Select...</option>
                        {allAccounts.map((a) => (<option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ''}{a.name}</option>))}
                      </select>
                    </td>
                  )}
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={line.hold} onChange={(e) => updateLine(i, { hold: e.target.checked })} />
                  </td>
                  <td className="px-2 py-2">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-xs text-red-600 hover:underline">Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:underline mb-4">+ Add line</button>

        <p className="text-sm text-gray-500 mb-1">Held lines aren&apos;t included in this check.</p>
        <p className="text-sm mb-4">Total: <span className="font-mono font-medium">{total.toFixed(2)}</span></p>

        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
            Save as recurring template
          </label>
          {saveAsTemplate && (
            <input type="text" placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="px-2 py-1 border rounded text-sm" />
          )}
        </div>

        <button type="submit" disabled={!canSubmit || submitting} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Posting...' : 'Post check'}
        </button>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        {success && <p className="text-green-600 text-sm mt-3">{success}</p>}

        {lineResults && (
          <div className="mt-4 border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Line</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {lineResults.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2">{r.line.matter_label || `Line ${i + 1}`}</td>
                    <td className="px-3 py-2">
                      {r.status === 'success' && <span className="text-green-600">Posted</span>}
                      {r.status === 'failed' && <span className="text-red-600">Failed: {r.detail}</span>}
                      {r.status === 'not_attempted' && <span className="text-gray-400">Not attempted</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lineResults.some((r) => r.status !== 'success') && (
              <button type="button" onClick={retryRemaining} disabled={submitting} className="m-3 text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
                Retry remaining lines
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
