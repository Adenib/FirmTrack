// @ts-nocheck
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import MatterSearchInput from '@/components/timetrack/matter-search-input'
import useTimetrackLookups from '@/components/timetrack/use-timetrack-lookups'

const DRAFT_KEY = 'firmtrack-quickfee-draft'

const today = () => new Date().toISOString().split('T')[0]

const emptyRow = () => ({
  rowId: crypto.randomUUID(),
  date: today(),
  matterQuery: '',
  matterId: '',
  clientName: '',
  lawyerId: '',
  taskCodeId: '',
  amount: '',
  explCode: '',
  explanation: '',
  hold: false,
  billable: true,
})

export default function QuickFeePage() {
  const { lawyers, taskCodes } = useTimetrackLookups()
  const [rows, setRows] = useState([emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) setRows(parsed)
      }
    } catch {
      // ignore corrupt draft
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rows))
  }, [rows])

  const updateRow = (rowId, patch) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const handleMatterSelect = (rowId, matter) => {
    updateRow(rowId, {
      matterId: matter.id,
      matterQuery: `${matter.matter_id} · ${matter.case_name}`,
      clientName: matter.clients?.name || '',
    })
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow()])

  const removeRow = (rowId) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : prev))
  }

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0),
    [rows]
  )

  const handleSave = async () => {
    setSubmitting(true)
    setError('')
    setSaveMessage('')

    const entries = rows
      .filter((r) => r.matterId && parseFloat(r.amount) > 0)
      .map((r) => ({
        entry_date: r.date,
        matter_id: r.matterId,
        lawyer_id: r.lawyerId || null,
        task_code_id: r.taskCodeId || null,
        amount: parseFloat(r.amount) || 0,
        expl_code: r.explCode || null,
        explanation: r.explanation || null,
        hold: r.hold,
        billable: r.billable,
        entry_type: 'quickfee',
      }))

    if (entries.length === 0) {
      setError('No rows to save — each row needs a matter and an amount.')
      setSubmitting(false)
      return
    }

    const response = await fetch('/api/timetrack/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not save fee entries')
      setSubmitting(false)
      return
    }

    setRows([emptyRow()])
    localStorage.removeItem(DRAFT_KEY)
    setSaveMessage(`Saved ${result.entries.length} fee entr${result.entries.length === 1 ? 'y' : 'ies'}.`)
    setSubmitting(false)
  }

  const inputClass = 'w-full px-2 py-1 border rounded text-sm'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Quick Fee</h1>
        <Link href="/timetrack" className="text-sm text-blue-600 hover:underline">
          ← Time Sheet
        </Link>
      </div>
      <p className="text-gray-600 mb-6">Enter flat fees directly against a matter.</p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto mb-3">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <th className="px-2 py-2 font-medium whitespace-nowrap">Date</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap w-64">Matter</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Client Name</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Lwyr</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Task</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Amount</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Expl. Code</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap w-56">Explanation</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Billable</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Hold</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowId} className="border-b border-gray-100 last:border-0 align-top">
                <td className="px-2 py-1">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(row.rowId, { date: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1">
                  <MatterSearchInput
                    value={row.matterQuery}
                    onChange={(v) => updateRow(row.rowId, { matterQuery: v, matterId: v ? row.matterId : '' })}
                    onSelect={(matter) => handleMatterSelect(row.rowId, matter)}
                  />
                </td>
                <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{row.clientName || '—'}</td>
                <td className="px-2 py-1">
                  <select
                    value={row.lawyerId}
                    onChange={(e) => updateRow(row.rowId, { lawyerId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">-</option>
                    {lawyers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nickname}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select
                    value={row.taskCodeId}
                    onChange={(e) => updateRow(row.rowId, { taskCodeId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">-</option>
                    {taskCodes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={row.amount}
                    onChange={(e) => updateRow(row.rowId, { amount: e.target.value })}
                    className={`${inputClass} w-24`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={row.explCode}
                    onChange={(e) => updateRow(row.rowId, { explCode: e.target.value })}
                    className={`${inputClass} w-16`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={row.explanation}
                    onChange={(e) => updateRow(row.rowId, { explanation: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={row.billable ? 'billable' : 'non-billable'}
                    onChange={(e) => updateRow(row.rowId, { billable: e.target.value === 'billable' })}
                    className={inputClass}
                  >
                    <option value="billable">Billable</option>
                    <option value="non-billable">Non-Billable</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select
                    value={row.hold ? 'hold' : 'no'}
                    onChange={(e) => updateRow(row.rowId, { hold: e.target.value === 'hold' })}
                    className={inputClass}
                  >
                    <option value="no">No Hold</option>
                    <option value="hold">Hold</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => removeRow(row.rowId)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mb-8">
        <button
          type="button"
          onClick={addRow}
          className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50"
        >
          + Add Row
        </button>

        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-600">
            Total: <span className="font-medium text-gray-900">{totalAmount.toFixed(2)}</span>
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {saveMessage && <p className="text-green-600 text-sm mb-4">{saveMessage}</p>}
    </div>
  )
}
