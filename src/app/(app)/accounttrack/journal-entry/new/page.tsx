// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const emptyLine = () => ({ account_id: '', description: '', debit: '', credit: '' })

export default function NewJournalEntryPage() {
  const [accounts, setAccounts] = useState([])
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState([emptyLine(), emptyLine()])

  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetch('/api/accounttrack/chart-of-accounts')
      .then((r) => r.json())
      .then((result) => setAccounts(result.accounts || []))

    fetch('/api/accounttrack/recurring-templates?transaction_type=journal_entry')
      .then((r) => r.json())
      .then((result) => setTemplates(result.templates || []))

    fetch('/api/accounttrack/journal-entries?source_type=manual')
      .then((r) => r.json())
      .then((result) => {
        const count = (result.entries || []).length
        const year = new Date().getFullYear()
        setReference(`JV-${year}-${String(count + 1).padStart(4, '0')}`)
      })
  }, [])

  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0)
  const balance = totalDebit - totalCredit
  const nonZeroLines = lines.filter((l) => Number(l.debit || 0) > 0 || Number(l.credit || 0) > 0)
  const balanced = Math.abs(balance) < 0.005 && nonZeroLines.length >= 2

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index))

  const applyTemplate = (id) => {
    setSelectedTemplateId(id)
    const template = templates.find((t) => t.id === id)
    if (!template) return
    const payload = template.payload || {}
    setDescription(payload.description || '')
    setLines((payload.lines || []).map((l) => ({ account_id: l.account_id || '', description: l.description || '', debit: '', credit: '' })))
    fetch('/api/accounttrack/recurring-templates', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, mark_used: true }),
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/accounttrack/journal-entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry_date: date,
        description,
        reference: reference || null,
        lines: nonZeroLines.map((l) => ({
          account_id: l.account_id,
          description: l.description || null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
        })),
      }),
    })
    const result = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(result.error || 'Could not post journal entry')
      return
    }

    if (saveAsTemplate && templateName) {
      await fetch('/api/accounttrack/recurring-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          transaction_type: 'journal_entry',
          payload: { description, lines: nonZeroLines.map((l) => ({ account_id: l.account_id, description: l.description })) },
        }),
      })
    }

    setSuccess(`Journal entry posted (${reference || result.journal_entry_id}).`)
    setDescription('')
    setLines([emptyLine(), emptyLine()])
    setSaveAsTemplate(false)
    setTemplateName('')
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">New G/L Adjustment</h1>
        <Link href="/accounttrack/registers" className="text-sm text-blue-600 hover:underline">
          ← Registers
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        A balanced manual journal entry — debits must equal credits before it can be posted.
      </p>

      {templates.length > 0 && (
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Use a recurring template</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="px-2 py-1.5 border rounded text-sm w-64"
          >
            <option value="">— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reference</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Explanation</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
        </div>

        <div className="border border-gray-200 rounded overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">G/L Account</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 w-32">Debit</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 w-32">Credit</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">
                    <select
                      value={line.account_id}
                      onChange={(e) => updateLine(i, { account_id: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-sm"
                    >
                      <option value="">Select account...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ''}{a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.debit}
                      onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
                      className="w-full px-2 py-1 border rounded text-sm text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.credit}
                      onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
                      className="w-full px-2 py-1 border rounded text-sm text-right"
                    />
                  </td>
                  <td className="px-2 py-2">
                    {lines.length > 2 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:underline mb-4">
          + Add line
        </button>

        <div className="flex items-center gap-6 mb-4 text-sm">
          <p>Debits: <span className="font-mono font-medium">{totalDebit.toFixed(2)}</span></p>
          <p>Credits: <span className="font-mono font-medium">{totalCredit.toFixed(2)}</span></p>
          <p className={Math.abs(balance) < 0.005 ? 'text-green-600' : 'text-red-600'}>
            Balance: <span className="font-mono font-medium">{balance.toFixed(2)}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
            Save as recurring template
          </label>
          {saveAsTemplate && (
            <input
              type="text"
              placeholder="Template name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            />
          )}
        </div>

        <button
          type="submit"
          disabled={!balanced || submitting}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Posting...' : 'Post journal entry'}
        </button>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        {success && <p className="text-green-600 text-sm mt-3">{success}</p>}
      </form>
    </div>
  )
}
