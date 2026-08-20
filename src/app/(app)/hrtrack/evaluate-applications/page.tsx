// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const PRIVILEGED_ROLES = ['owner', 'admin', 'manager', 'hr']
const LAW_TYPES = ['Corporate', 'Litigation', 'Debt Recovery', 'Employment', 'Real Estate', 'Intellectual Property', 'Tax', 'Banking & Finance', 'Mergers & Acquisitions', 'Family', 'Criminal', 'Immigration', 'Other']

// Category key -> weight, mirrored from the API route for a live preview
// total only -- the authoritative total_score is always computed server-side.
const CATEGORY_WEIGHTS = {
  legal_accuracy: 0.20,
  legal_research_citations: 0.15,
  drafting_quality: 0.15,
  document_review_analysis: 0.10,
  productivity_time_savings: 0.10,
  usability_ux: 0.10,
  security_confidentiality: 0.10,
  workflow_integration: 0.05,
  reliability_performance: 0.025,
  cost_roi_scalability: 0.025,
}

const CATEGORIES = [
  { key: 'legal_accuracy', label: 'Legal Accuracy', weight: '20%' },
  { key: 'legal_research_citations', label: 'Legal Research & Citations', weight: '15%' },
  { key: 'drafting_quality', label: 'Drafting Quality', weight: '15%' },
  { key: 'document_review_analysis', label: 'Document Review & Analysis', weight: '10%' },
  { key: 'productivity_time_savings', label: 'Productivity / Time Savings', weight: '10%' },
  { key: 'usability_ux', label: 'Usability & User Experience', weight: '10%' },
  { key: 'security_confidentiality', label: 'Security & Confidentiality', weight: '10%' },
  { key: 'workflow_integration', label: 'Workflow / Integration', weight: '5%' },
  { key: 'reliability_performance', label: 'Reliability / Performance', weight: '2.5%' },
  { key: 'cost_roi_scalability', label: 'Cost / ROI / Scalability', weight: '2.5%' },
]

// The 5 categories with a Daily Log equivalent -- used by "Fill from daily
// averages." The other 5 have no daily-log counterpart and stay manual.
const AUTO_FILL_MAP = {
  legal_accuracy: (avg) => avg.accuracy * 20,
  legal_research_citations: (avg) => avg.citation_accuracy * 20,
  drafting_quality: (avg) => avg.quality * 20,
  productivity_time_savings: (avg) => avg.time_saved_pct,
  usability_ux: (avg) => avg.ease_of_use * 20,
}

function fmtStars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

const emptyLogForm = () => ({
  id: null,
  application_name: 'August',
  practice_area: '',
  task: '',
  entry_date: new Date().toISOString().split('T')[0],
  traditional_time_minutes: '',
  app_time_minutes: '',
  accuracy: 5,
  quality: 5,
  citation_accuracy: 5,
  ease_of_use: 5,
  material_error: false,
  overall_rating: 5,
  comments: '',
})

const emptyScorecardForm = () => ({
  application_name: 'August',
  period: '',
  period_start: '',
  period_end: '',
  legal_accuracy: '',
  legal_research_citations: '',
  drafting_quality: '',
  document_review_analysis: '',
  productivity_time_savings: '',
  usability_ux: '',
  security_confidentiality: '',
  workflow_integration: '',
  reliability_performance: '',
  cost_roi_scalability: '',
  comments: '',
})

export default function EvaluateApplicationsPage() {
  const [tab, setTab] = useState('log')
  const [me, setMe] = useState(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)

  const [entries, setEntries] = useState([])
  const [logForm, setLogForm] = useState(emptyLogForm())
  const [logSubmitting, setLogSubmitting] = useState(false)
  const [logError, setLogError] = useState('')

  const [scorecards, setScorecards] = useState([])
  const [scForm, setScForm] = useState(emptyScorecardForm())
  const [scSubmitting, setScSubmitting] = useState(false)
  const [scError, setScError] = useState('')
  const [scFilling, setScFilling] = useState(false)

  const isPrivileged = PRIVILEGED_ROLES.includes(role)

  const loadEntries = async () => {
    const res = await fetch('/api/hrtrack/app-evaluations')
    const result = await res.json()
    if (res.ok) setEntries(result.entries || [])
  }

  const loadScorecards = async () => {
    const res = await fetch('/api/hrtrack/app-evaluation-scorecards')
    const result = await res.json()
    if (res.ok) setScorecards(result.scorecards || [])
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setMe(user)

      const layoutRes = await fetch('/api/layout-data').then((r) => r.json())
      setRole(layoutRes.profile?.role || '')

      await Promise.all([loadEntries(), loadScorecards()])
      setLoading(false)
    }
    init()
  }, [])

  const myEntries = entries.filter((e) => e.user_id === me?.id)
  const visibleEntries = isPrivileged ? entries : myEntries

  const traditionalNum = Number(logForm.traditional_time_minutes)
  const appNum = Number(logForm.app_time_minutes)
  const timeSavedPreview = traditionalNum > 0 ? Math.round(((traditionalNum - appNum) / traditionalNum) * 100 * 100) / 100 : null

  const resetLogForm = () => {
    setLogForm(emptyLogForm())
    setLogError('')
  }

  const handleLogSubmit = async (e) => {
    e.preventDefault()
    setLogSubmitting(true)
    setLogError('')

    const { id, ...payload } = logForm
    const res = await fetch('/api/hrtrack/app-evaluations', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(id ? { id, ...payload } : payload),
    })
    const result = await res.json()
    setLogSubmitting(false)

    if (!res.ok) {
      setLogError(result.error || 'Could not save entry')
      return
    }
    resetLogForm()
    await loadEntries()
  }

  const handleEditEntry = (entry) => {
    setLogForm({
      id: entry.id,
      application_name: entry.application_name,
      practice_area: entry.practice_area || '',
      task: entry.task,
      entry_date: entry.entry_date,
      traditional_time_minutes: entry.traditional_time_minutes,
      app_time_minutes: entry.app_time_minutes,
      accuracy: entry.accuracy,
      quality: entry.quality,
      citation_accuracy: entry.citation_accuracy,
      ease_of_use: entry.ease_of_use,
      material_error: entry.material_error,
      overall_rating: entry.overall_rating,
      comments: entry.comments || '',
    })
    setLogError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteEntry = async (entry) => {
    if (!confirm('Delete this entry? This can\'t be undone.')) return
    const res = await fetch(`/api/hrtrack/app-evaluations?id=${entry.id}`, { method: 'DELETE' })
    if (res.ok) {
      if (logForm.id === entry.id) resetLogForm()
      await loadEntries()
    }
  }

  const scTotalPreview = (() => {
    let sum = 0
    for (const key of Object.keys(CATEGORY_WEIGHTS)) {
      const value = Number(scForm[key])
      if (!Number.isFinite(value)) return null
      sum += value * CATEGORY_WEIGHTS[key]
    }
    return Math.round(sum * 100) / 100
  })()

  const handleFillFromDailyAverages = async () => {
    if (!scForm.period_start || !scForm.period_end) {
      setScError('Set the period start/end dates first')
      return
    }
    setScFilling(true)
    setScError('')

    const params = new URLSearchParams({
      application_name: scForm.application_name || 'August',
      from: scForm.period_start,
      to: scForm.period_end,
    })
    const res = await fetch(`/api/hrtrack/app-evaluations?${params}`)
    const result = await res.json()
    setScFilling(false)
    if (!res.ok) {
      setScError(result.error || 'Could not load daily entries')
      return
    }

    const matching = result.entries || []
    if (matching.length === 0) {
      setScError('No daily entries found for that application/date range -- fill categories manually.')
      return
    }

    const avg = {
      accuracy: matching.reduce((s, e) => s + Number(e.accuracy), 0) / matching.length,
      citation_accuracy: matching.reduce((s, e) => s + Number(e.citation_accuracy), 0) / matching.length,
      quality: matching.reduce((s, e) => s + Number(e.quality), 0) / matching.length,
      time_saved_pct: matching.reduce((s, e) => s + Number(e.time_saved_pct), 0) / matching.length,
      ease_of_use: matching.reduce((s, e) => s + Number(e.ease_of_use), 0) / matching.length,
    }

    setScForm((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(AUTO_FILL_MAP)) {
        next[key] = Math.round(AUTO_FILL_MAP[key](avg) * 100) / 100
      }
      return next
    })
  }

  const handleScorecardSubmit = async (e) => {
    e.preventDefault()
    setScSubmitting(true)
    setScError('')

    const res = await fetch('/api/hrtrack/app-evaluation-scorecards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(scForm),
    })
    const result = await res.json()
    setScSubmitting(false)

    if (!res.ok) {
      setScError(result.error || 'Could not save scorecard')
      return
    }
    setScForm(emptyScorecardForm())
    await loadScorecards()
  }

  const TABS = [
    { key: 'log', label: 'Daily Log' },
    { key: 'scorecard', label: 'Scorecard' },
  ]

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Evaluate Applications</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-4">
        Track how AI applications like August perform against traditional work, task by task, and roll it up
        into a weighted scorecard.
      </p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {tab === 'log' && (
            <div>
              <form onSubmit={handleLogSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 mb-6">
                <p className="font-medium text-gray-900">{logForm.id ? 'Edit entry' : 'New entry'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Application</label>
                    <input type="text" required value={logForm.application_name} onChange={(e) => setLogForm((p) => ({ ...p, application_name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Practice Area</label>
                    <select value={logForm.practice_area} onChange={(e) => setLogForm((p) => ({ ...p, practice_area: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm">
                      <option value="">Select...</option>
                      {LAW_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Date</label>
                    <input type="date" required value={logForm.entry_date} onChange={(e) => setLogForm((p) => ({ ...p, entry_date: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Task</label>
                  <input type="text" required placeholder="e.g. Legal research" value={logForm.task} onChange={(e) => setLogForm((p) => ({ ...p, task: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Traditional Time (mins)</label>
                    <input type="number" min="0.01" step="0.01" required value={logForm.traditional_time_minutes} onChange={(e) => setLogForm((p) => ({ ...p, traditional_time_minutes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{logForm.application_name || 'App'} Time (mins)</label>
                    <input type="number" min="0" step="0.01" required value={logForm.app_time_minutes} onChange={(e) => setLogForm((p) => ({ ...p, app_time_minutes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Time Saved</label>
                    <p className="px-2 py-1.5 text-sm text-gray-700">{timeSavedPreview === null ? '—' : `${timeSavedPreview}%`}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    ['accuracy', 'Accuracy'],
                    ['quality', 'Quality'],
                    ['citation_accuracy', 'Citation Accuracy'],
                    ['ease_of_use', 'Ease of Use'],
                    ['overall_rating', 'Overall Rating'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <select value={logForm[key]} onChange={(e) => setLogForm((p) => ({ ...p, [key]: Number(e.target.value) }))} className="w-full px-1 py-1.5 border rounded text-xs">
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{fmtStars(n)} ({n})</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={logForm.material_error} onChange={(e) => setLogForm((p) => ({ ...p, material_error: e.target.checked }))} />
                    Material error
                  </label>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Comments</label>
                  <textarea rows={2} value={logForm.comments} onChange={(e) => setLogForm((p) => ({ ...p, comments: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                </div>

                {logError && <p className="text-red-600 text-xs">{logError}</p>}
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={logSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                    {logSubmitting ? 'Saving...' : logForm.id ? 'Save changes' : 'Log entry'}
                  </button>
                  {logForm.id && (
                    <button type="button" onClick={resetLogForm} className="text-sm text-gray-500 hover:underline">Cancel edit</button>
                  )}
                </div>
              </form>

              <p className="font-medium text-gray-900 mb-2">{isPrivileged ? 'All entries' : 'Your entries'}</p>
              <div className="space-y-2">
                {visibleEntries.length === 0 ? (
                  <p className="text-gray-500 text-sm">No entries yet.</p>
                ) : (
                  visibleEntries.map((entry) => (
                    <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">
                          {entry.task} <span className="text-gray-400 font-normal">· {entry.application_name}</span>
                        </p>
                        <span className="text-amber-500 text-sm">{fmtStars(entry.overall_rating)}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {isPrivileged && entry.user?.email ? `${entry.user.email} · ` : ''}
                        {entry.practice_area ? `${entry.practice_area} · ` : ''}{entry.entry_date} ·{' '}
                        Traditional {entry.traditional_time_minutes}m → {entry.application_name} {entry.app_time_minutes}m
                        {' '}(saved {entry.time_saved_pct}%)
                        {entry.material_error && <span className="text-red-600 font-medium"> · Material error</span>}
                      </p>
                      {entry.comments && <p className="text-sm text-gray-700 mt-1">{entry.comments}</p>}
                      {entry.user_id === me?.id && (
                        <div className="flex items-center gap-3 mt-2">
                          <button type="button" onClick={() => handleEditEntry(entry)} className="text-xs text-blue-600 hover:underline">Edit</button>
                          <button type="button" onClick={() => handleDeleteEntry(entry)} className="text-xs text-red-600 hover:underline">Delete</button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'scorecard' && (
            <div>
              {isPrivileged && (
                <form onSubmit={handleScorecardSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 mb-6">
                  <p className="font-medium text-gray-900">New scorecard</p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Application</label>
                      <input type="text" required value={scForm.application_name} onChange={(e) => setScForm((p) => ({ ...p, application_name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Period label</label>
                      <input type="text" required placeholder="e.g. Q3 2026" value={scForm.period} onChange={(e) => setScForm((p) => ({ ...p, period: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Period start</label>
                      <input type="date" required value={scForm.period_start} onChange={(e) => setScForm((p) => ({ ...p, period_start: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Period end</label>
                      <input type="date" required value={scForm.period_end} onChange={(e) => setScForm((p) => ({ ...p, period_end: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                    </div>
                  </div>

                  <button type="button" onClick={handleFillFromDailyAverages} disabled={scFilling} className="text-sm border border-blue-300 text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-50 disabled:opacity-50">
                    {scFilling ? 'Loading...' : 'Fill from daily averages'}
                  </button>
                  <p className="text-xs text-gray-500">
                    Prefills Legal Accuracy, Legal Research &amp; Citations, Drafting Quality, Productivity/Time Savings,
                    and Usability &amp; UX from that period&apos;s Daily Log averages. Still editable before saving.
                  </p>

                  <div className="border border-gray-200 rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Category</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500 w-16">Weight</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">Score (0-100)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORIES.map((c) => (
                          <tr key={c.key} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2 text-gray-700">{c.label}</td>
                            <td className="px-3 py-2 text-gray-400">{c.weight}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number" min="0" max="100" step="0.01" required
                                value={scForm[c.key]}
                                onChange={(e) => setScForm((p) => ({ ...p, [c.key]: e.target.value }))}
                                className="w-full px-2 py-1 border rounded text-sm text-right"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-sm">
                    Total Score: <span className="font-mono font-medium">{scTotalPreview === null ? '—' : scTotalPreview}</span> / 100
                  </p>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Comments</label>
                    <textarea rows={2} value={scForm.comments} onChange={(e) => setScForm((p) => ({ ...p, comments: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                  </div>

                  {scError && <p className="text-red-600 text-xs">{scError}</p>}
                  <button type="submit" disabled={scSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                    {scSubmitting ? 'Saving...' : 'Save scorecard'}
                  </button>
                </form>
              )}

              <p className="font-medium text-gray-900 mb-2">Past scorecards</p>
              <div className="space-y-2">
                {scorecards.length === 0 ? (
                  <p className="text-gray-500 text-sm">No scorecards yet.</p>
                ) : (
                  scorecards.map((sc) => (
                    <div key={sc.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">{sc.application_name} — {sc.period}</p>
                        <span className="text-sm font-mono font-medium text-blue-600">{sc.total_score} / 100</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">
                        {sc.period_start} to {sc.period_end} · Evaluated by {sc.evaluator?.email} on {new Date(sc.created_at).toLocaleDateString()}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1 text-xs text-gray-600">
                        {CATEGORIES.map((c) => (
                          <p key={c.key}>{c.label}: <span className="font-medium text-gray-900">{sc[c.key]}</span></p>
                        ))}
                      </div>
                      {sc.comments && <p className="text-sm text-gray-700 mt-2">{sc.comments}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
