// @ts-nocheck
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import MatterSearchInput from '@/components/timetrack/matter-search-input'
import MatterSummaryCard from '@/components/timetrack/matter-summary-card'
import CalendarEventPicker from '@/components/timetrack/calendar-event-picker'
import useTimetrackLookups, { lawyerRateFor } from '@/components/timetrack/use-timetrack-lookups'
import { PlayIcon, PauseIcon } from '@/components/brand/icons'

const DRAFT_KEY = 'firmtrack-timesheet-draft'
const AI_HIDDEN_KEY = 'firmtrack-ai-drafting-hidden'

const today = () => new Date().toISOString().split('T')[0]

const emptyRow = () => ({
  rowId: crypto.randomUUID(),
  timerRunning: false,
  timerSeconds: 0,
  date: today(),
  matterQuery: '',
  matterId: '',
  matterLabel: '',
  clientName: '',
  rateType: null,
  lawyerId: '',
  taskCodeId: '',
  hours: '',
  rate: '',
  explCode: '',
  explanation: '',
  notes: '',
  hold: false,
  billable: true,
  calendarEventId: '',
  calendarEventLabel: '',
})

function parseHours(input) {
  if (!input) return 0
  const str = String(input).trim()
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number)
    return (h || 0) + (m || 0) / 60
  }
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

function Field({ label, className, children }) {
  return (
    <div className={`flex flex-col gap-1 ${className || ''}`}>
      <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}

export default function TimeTrackPage() {
  const { lawyers, taskCodes } = useTimetrackLookups()
  const [rows, setRows] = useState([emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const timerRefs = useRef({})

  const [savedEntries, setSavedEntries] = useState([])
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterLawyerId, setFilterLawyerId] = useState('')
  const [filterMatterQuery, setFilterMatterQuery] = useState('')
  const [filterMatterId, setFilterMatterId] = useState('')
  const [loadingEntries, setLoadingEntries] = useState(false)

  // AI-assisted drafting: off unless the firm has opted in (owner/admin,
  // see /timetrack/settings) AND this user hasn't personally hidden it.
  const [aiDraftingEnabled, setAiDraftingEnabled] = useState(false)
  const [aiHiddenForMe, setAiHiddenForMe] = useState(false)
  const [aiDraftingRowId, setAiDraftingRowId] = useState(null)
  const [aiDraftError, setAiDraftError] = useState('')

  useEffect(() => {
    setAiHiddenForMe(localStorage.getItem(AI_HIDDEN_KEY) === 'true')
    fetch('/api/timetrack/settings')
      .then((r) => r.json())
      .then((result) => setAiDraftingEnabled(!!result?.settings?.ai_drafting_enabled))
      .catch(() => {})
  }, [])

  const toggleAiHiddenForMe = () => {
    setAiHiddenForMe((prev) => {
      const next = !prev
      localStorage.setItem(AI_HIDDEN_KEY, String(next))
      return next
    })
  }

  const showAiDrafting = aiDraftingEnabled && !aiHiddenForMe

  // Load draft from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRows(parsed.map((r) => ({ ...r, timerRunning: false })))
        }
      }
    } catch {
      // ignore corrupt draft
    }
  }, [])

  // Persist draft on every change.
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rows))
  }, [rows])

  useEffect(() => {
    return () => {
      Object.values(timerRefs.current).forEach((id) => clearInterval(id))
    }
  }, [])

  const loadEntries = async () => {
    setLoadingEntries(true)
    const params = new URLSearchParams()
    if (filterFrom) params.set('from', filterFrom)
    if (filterTo) params.set('to', filterTo)
    if (filterLawyerId) params.set('lawyer_id', filterLawyerId)
    if (filterMatterId) params.set('matter_id', filterMatterId)
    params.set('entry_type', 'timesheet')

    const response = await fetch(`/api/timetrack/entries?${params.toString()}`)
    const result = await response.json()
    if (response.ok) setSavedEntries(result.entries || [])
    setLoadingEntries(false)
  }

  useEffect(() => {
    loadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo, filterLawyerId, filterMatterId])

  const updateRow = (rowId, patch) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const withAutoRate = (row) => {
    const lawyer = lawyers.find((l) => l.id === row.lawyerId)
    const rate = lawyerRateFor(lawyer, row.rateType)
    return rate !== null ? { ...row, rate: String(rate) } : row
  }

  const handleMatterSelect = (rowId, matter) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? withAutoRate({
              ...r,
              matterId: matter.id,
              matterQuery: `${matter.matter_id} · ${matter.case_name}`,
              matterLabel: `${matter.matter_id} · ${matter.case_name}`,
              clientName: matter.clients?.name || '',
              rateType: matter.rate_type,
            })
          : r
      )
    )
  }

  const handleCalendarEventSelect = (rowId, event) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r
        const startAt = new Date(event.start_at)
        const endAt = new Date(event.end_at)
        const hours = Math.max(0, (endAt - startAt) / 3600000)
        let next = {
          ...r,
          calendarEventId: event.id,
          calendarEventLabel: event.title,
          date: startAt.toISOString().split('T')[0],
          hours: hours > 0 ? hours.toFixed(2) : r.hours,
        }
        if (event.matter) {
          next = withAutoRate({
            ...next,
            matterId: event.matter.id,
            matterQuery: `${event.matter.matter_id} · ${event.matter.case_name}`,
            matterLabel: `${event.matter.matter_id} · ${event.matter.case_name}`,
          })
        }
        return next
      })
    )
  }

  const handleCalendarEventUnlink = (rowId) => {
    updateRow(rowId, { calendarEventId: '', calendarEventLabel: '' })
  }

  const handleAiDraft = async (rowId) => {
    const row = rows.find((r) => r.rowId === rowId)
    if (!row?.calendarEventId) return
    setAiDraftingRowId(rowId)
    setAiDraftError('')

    const res = await fetch('/api/timetrack/ai-draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ calendar_event_id: row.calendarEventId }),
    })
    const result = await res.json()

    if (!res.ok) {
      setAiDraftError(result.error || 'AI drafting failed')
      setAiDraftingRowId(null)
      return
    }

    const matchedTaskCode = result.suggestedTaskCode
      ? taskCodes.find((t) => t.code === result.suggestedTaskCode)
      : null

    updateRow(rowId, {
      explanation: result.narrative,
      ...(matchedTaskCode ? { taskCodeId: matchedTaskCode.id } : {}),
    })
    setAiDraftingRowId(null)
  }

  const handleLawyerChange = (rowId, lawyerId) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? withAutoRate({ ...r, lawyerId }) : r)))
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow()])

  const removeRow = (rowId) => {
    if (timerRefs.current[rowId]) {
      clearInterval(timerRefs.current[rowId])
      delete timerRefs.current[rowId]
    }
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : prev))
  }

  const startTimer = (rowId) => {
    if (timerRefs.current[rowId]) return
    updateRow(rowId, { timerRunning: true })
    timerRefs.current[rowId] = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => (r.rowId === rowId ? { ...r, timerSeconds: r.timerSeconds + 1 } : r))
      )
    }, 1000)
  }

  const stopTimer = (rowId) => {
    if (timerRefs.current[rowId]) {
      clearInterval(timerRefs.current[rowId])
      delete timerRefs.current[rowId]
    }
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? { ...r, timerRunning: false, hours: (r.timerSeconds / 3600).toFixed(2) }
          : r
      )
    )
  }

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        const hours = parseHours(r.hours)
        const amount = hours * (parseFloat(r.rate) || 0)
        return { hours: acc.hours + hours, amount: acc.amount + amount }
      },
      { hours: 0, amount: 0 }
    )
  }, [rows])

  const handleSave = async () => {
    setSubmitting(true)
    setError('')
    setSaveMessage('')

    const entries = rows
      .filter((r) => r.matterId && parseHours(r.hours) > 0)
      .map((r) => {
        const hours = parseHours(r.hours)
        const rate = parseFloat(r.rate) || 0
        return {
          entry_date: r.date,
          matter_id: r.matterId,
          lawyer_id: r.lawyerId || null,
          task_code_id: r.taskCodeId || null,
          hours,
          rate: rate,
          amount: hours * rate,
          expl_code: r.explCode || null,
          explanation: r.explanation || null,
          notes: r.notes || null,
          hold: r.hold,
          billable: r.billable,
          calendar_event_id: r.calendarEventId || null,
          entry_type: 'timesheet',
        }
      })

    if (entries.length === 0) {
      setError('No rows to save — each row needs a matter and hours.')
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
      setError(result.error || 'Could not save time entries')
      setSubmitting(false)
      return
    }

    Object.values(timerRefs.current).forEach((id) => clearInterval(id))
    timerRefs.current = {}
    setRows([emptyRow()])
    localStorage.removeItem(DRAFT_KEY)
    setSaveMessage(`Saved ${result.entries.length} time entr${result.entries.length === 1 ? 'y' : 'ies'}.`)
    setSubmitting(false)
    await loadEntries()
  }

  const inputClass = 'w-full px-2 py-1 border rounded text-sm'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Time Sheet</h1>
        <div className="flex items-center gap-4">
          <Link href="/timetrack/activity" className="text-sm text-blue-600 hover:underline">
            Activity Log
          </Link>
          <Link href="/timetrack/quick-fee" className="text-sm text-blue-600 hover:underline">
            Quick Fee →
          </Link>
          <Link href="/timetrack/reports" className="text-sm text-blue-600 hover:underline">
            Reports →
          </Link>
          <Link href="/timetrack/settings" className="text-sm text-blue-600 hover:underline">
            Settings →
          </Link>
        </div>
      </div>
      <p className="text-gray-600 mb-1">Log billable time against matters.</p>
      {aiDraftingEnabled && (
        <button
          type="button"
          onClick={toggleAiHiddenForMe}
          className="text-xs text-gray-400 hover:text-gray-600 hover:underline mb-4 block"
        >
          {aiHiddenForMe ? 'Show "Draft with AI" for me' : 'Hide "Draft with AI" for me'}
        </button>
      )}
      {!aiDraftingEnabled && <div className="mb-4" />}
      {aiDraftError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700">
          {aiDraftError}
        </div>
      )}

      <div className="space-y-3 mb-3">
        {rows.map((row) => {
          const hours = parseHours(row.hours)
          const amount = hours * (parseFloat(row.rate) || 0)
          return (
            <div key={row.rowId} className="relative bg-white border border-gray-200 rounded-lg p-3 pr-8">
              <button
                type="button"
                onClick={() => removeRow(row.rowId)}
                aria-label="Remove row"
                className="absolute top-2 right-2 text-gray-300 hover:text-red-600 text-sm leading-none"
              >
                ✕
              </button>

              {/* Row 1: identity — timer, date, matter, client, lawyer, task */}
              <div className="flex flex-wrap gap-3 mb-3">
                <Field label="Timer" className="w-28">
                  <button
                    type="button"
                    onClick={() => (row.timerRunning ? stopTimer(row.rowId) : startTimer(row.rowId))}
                    className={
                      row.timerRunning
                        ? 'w-full text-xs px-2 py-1 rounded bg-red-100 text-red-700 whitespace-nowrap'
                        : 'w-full text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 whitespace-nowrap'
                    }
                  >
                    {row.timerRunning ? (
                      <PauseIcon className="inline w-3 h-3 mb-0.5" />
                    ) : (
                      <PlayIcon className="inline w-3 h-3 mb-0.5" />
                    )}{' '}
                    {formatTimer(row.timerSeconds)}
                  </button>
                </Field>

                <Field label="Calendar" className="w-40">
                  {row.calendarEventId ? (
                    <div className="flex items-center gap-1 px-2 py-1 border rounded text-xs bg-blue-50 text-blue-700">
                      <span className="truncate">{row.calendarEventLabel}</span>
                      <button
                        type="button"
                        onClick={() => handleCalendarEventUnlink(row.rowId)}
                        aria-label="Unlink calendar event"
                        className="text-blue-400 hover:text-blue-700"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <CalendarEventPicker onSelect={(event) => handleCalendarEventSelect(row.rowId, event)} />
                  )}
                </Field>

                <Field label="Date" className="w-36">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(row.rowId, { date: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Matter" className="w-64">
                  <MatterSearchInput
                    value={row.matterQuery}
                    onChange={(v) => updateRow(row.rowId, { matterQuery: v, matterId: v ? row.matterId : '' })}
                    onSelect={(matter) => handleMatterSelect(row.rowId, matter)}
                  />
                </Field>

                <Field label="Client Name" className="w-40">
                  <p className="px-2 py-1 text-sm text-gray-600 truncate">{row.clientName || '—'}</p>
                </Field>

                <Field label="Lwyr" className="w-28">
                  <select
                    value={row.lawyerId}
                    onChange={(e) => handleLawyerChange(row.rowId, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">-</option>
                    {lawyers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nickname}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Task" className="w-28">
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
                </Field>
              </div>

              {/* Row 2: billing + notes — hours, rate, amount, expl code, explanation, notes, hold */}
              <div className="flex flex-wrap gap-3">
                <Field label="Hours" className="w-20">
                  <input
                    type="text"
                    placeholder="0.00"
                    value={row.hours}
                    onChange={(e) => updateRow(row.rowId, { hours: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Rate" className="w-24">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={row.rate}
                    onChange={(e) => updateRow(row.rowId, { rate: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Amount" className="w-24">
                  <p className="px-2 py-1 text-sm font-medium text-gray-900">{amount.toFixed(2)}</p>
                </Field>

                <Field label="Expl. Code" className="w-20">
                  <input
                    type="text"
                    value={row.explCode}
                    onChange={(e) => updateRow(row.rowId, { explCode: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Explanation" className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={row.explanation}
                      onChange={(e) => updateRow(row.rowId, { explanation: e.target.value })}
                      className={inputClass}
                    />
                    {showAiDrafting && row.calendarEventId && (
                      <button
                        type="button"
                        onClick={() => handleAiDraft(row.rowId)}
                        disabled={aiDraftingRowId === row.rowId}
                        title="Draft a billing narrative from the linked calendar event with AI"
                        className="shrink-0 text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 whitespace-nowrap"
                      >
                        {aiDraftingRowId === row.rowId ? 'Drafting...' : '✨ Draft with AI'}
                      </button>
                    )}
                  </div>
                </Field>

                <Field label="Notes" className="flex-1 min-w-[160px]">
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => updateRow(row.rowId, { notes: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Billable" className="w-32">
                  <select
                    value={row.billable ? 'billable' : 'non-billable'}
                    onChange={(e) => updateRow(row.rowId, { billable: e.target.value === 'billable' })}
                    className={inputClass}
                  >
                    <option value="billable">Billable</option>
                    <option value="non-billable">Non-Billable</option>
                  </select>
                </Field>

                <Field label="Hold" className="w-28">
                  <select
                    value={row.hold ? 'hold' : 'no'}
                    onChange={(e) => updateRow(row.rowId, { hold: e.target.value === 'hold' })}
                    className={inputClass}
                  >
                    <option value="no">No Hold</option>
                    <option value="hold">Hold</option>
                  </select>
                </Field>
              </div>
            </div>
          )
        })}
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
            Total: <span className="font-medium text-gray-900">{totals.hours.toFixed(2)} hrs</span>{' '}
            · <span className="font-medium text-gray-900">{totals.amount.toFixed(2)}</span>
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

      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Saved Entries</h2>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lawyer</label>
            <select
              value={filterLawyerId}
              onChange={(e) => setFilterLawyerId(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="">All lawyers</option>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nickname}
                </option>
              ))}
            </select>
          </div>
          <div className="w-64">
            <label className="block text-xs text-gray-500 mb-1">Matter</label>
            <MatterSearchInput
              value={filterMatterQuery}
              onChange={(v) => {
                setFilterMatterQuery(v)
                if (!v) setFilterMatterId('')
              }}
              onSelect={(matter) => {
                setFilterMatterQuery(`${matter.matter_id} · ${matter.case_name}`)
                setFilterMatterId(matter.id)
              }}
              placeholder="All matters"
            />
          </div>
          {(filterFrom || filterTo || filterLawyerId || filterMatterId) && (
            <button
              type="button"
              onClick={() => {
                setFilterFrom('')
                setFilterTo('')
                setFilterLawyerId('')
                setFilterMatterQuery('')
                setFilterMatterId('')
              }}
              className="text-xs text-blue-600 hover:underline pb-1"
            >
              Clear filters
            </button>
          )}
        </div>

        <MatterSummaryCard matterId={filterMatterId} />

        {loadingEntries ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : savedEntries.length === 0 ? (
          <p className="text-gray-500 text-sm">No saved entries match these filters.</p>
        ) : (
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
                  <th className="px-3 py-2 font-medium">Hold</th>
                </tr>
              </thead>
              <tbody>
                {savedEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-gray-700">{entry.entry_date}</td>
                    <td className="px-3 py-2 text-gray-700">{entry.matters?.matter_id || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{entry.lawyers?.nickname || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{entry.task_codes?.code || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{Number(entry.hours || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-700">{Number(entry.rate || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-700">{Number(entry.amount || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-500">{entry.billable === false ? 'No' : 'Yes'}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{entry.hold ? 'Hold' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
