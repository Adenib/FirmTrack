// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import MatterSearchInput from '@/components/timetrack/matter-search-input'

const PRIVILEGED_ROLES = ['owner', 'admin', 'manager']
const SEVERITY_STYLES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
}
const PLAYBOOK_STATUS_STYLES = {
  pass: 'text-green-600',
  fail: 'text-red-600',
  unclear: 'text-amber-600',
}

const emptyPlaybookForm = () => ({ id: null, name: '', description: '', rules: [{ label: '', instructions: '' }] })

const emptyDraftForm = () => ({ document_type: '', matter_id: '', matter_query: '', matter_label: '', prompt: '' })

function DraftResult({ draft, canSaveToDocTrack, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [title, setTitle] = useState(`${draft.document_type} — ${new Date(draft.created_at).toLocaleDateString()}`)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    const formData = new FormData()
    formData.append('title', title)
    if (draft.matter_id) formData.append('matter_id', draft.matter_id)
    formData.append('category', 'AI Draft')
    formData.append('file', new File([draft.content], `${title}.txt`, { type: 'text/plain' }))

    const res = await fetch('/api/doctrack/documents', { method: 'POST', body: formData })
    const result = await res.json()
    setSaving(false)
    if (!res.ok) {
      setSaveError(result.error || 'Could not save to DocTrack')
      return
    }
    setSaved(true)
    onSaved?.(result.document)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-xs text-gray-500">
        {draft.document_type} · {new Date(draft.created_at).toLocaleString()}
        {draft.author?.email ? ` · ${draft.author.email}` : ''}
        {draft.matters?.case_name ? ` · ${draft.matters.case_name}` : ''}
      </p>
      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded p-3 max-h-96 overflow-y-auto">{draft.content}</pre>
      {draft.notes && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <span className="font-medium">Notes for review: </span>{draft.notes}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleCopy} className="text-xs text-blue-600 hover:underline">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {canSaveToDocTrack ? (
        !saved ? (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 px-2 py-1.5 border rounded text-sm" />
            <button type="button" onClick={handleSave} disabled={saving} className="text-sm bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap">
              {saving ? 'Saving...' : 'Save to DocTrack'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-green-600 pt-2 border-t border-gray-100">Saved to DocTrack as &quot;{title}&quot;.</p>
        )
      ) : (
        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">DocTrack isn&apos;t active for this firm, so this draft can&apos;t be saved as a document -- copy it instead.</p>
      )}
      {saveError && <p className="text-red-600 text-xs">{saveError}</p>}
    </div>
  )
}

function ReviewResults({ review }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div>
        <p className="text-xs text-gray-500 mb-1">
          Reviewed {new Date(review.created_at).toLocaleString()} by {review.reviewer?.email || 'unknown'}
          {review.playbook?.name ? ` · Playbook: ${review.playbook.name}` : ''}
        </p>
        <p className="text-sm text-gray-700">{review.summary}</p>
      </div>

      {review.key_terms?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Key terms</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {review.key_terms.map((t, i) => (
              <p key={i}><span className="text-gray-500">{t.label}:</span> <span className="text-gray-900">{t.value}</span></p>
            ))}
          </div>
        </div>
      )}

      {review.key_dates?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Key dates</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {review.key_dates.map((d, i) => (
              <p key={i}><span className="text-gray-500">{d.label}:</span> <span className="text-gray-900">{d.date}</span></p>
            ))}
          </div>
        </div>
      )}

      {review.risk_flags?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Risk flags</p>
          <div className="space-y-1">
            {review.risk_flags.map((r, i) => (
              <p key={i} className="text-sm">
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize font-medium mr-2 ${SEVERITY_STYLES[r.severity] || SEVERITY_STYLES.low}`}>{r.severity}</span>
                {r.description}
              </p>
            ))}
          </div>
        </div>
      )}

      {review.playbook_results?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Playbook results</p>
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Rule</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 w-24">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Notes</th>
                </tr>
              </thead>
              <tbody>
                {review.playbook_results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-gray-700">{r.rule_label}</td>
                    <td className={`px-3 py-2 capitalize font-medium ${PLAYBOOK_STATUS_STYLES[r.status] || ''}`}>{r.status}</td>
                    <td className="px-3 py-2 text-gray-600">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AITrackPage() {
  const [tab, setTab] = useState('reviews')
  const [role, setRole] = useState('')

  // Document Reviews tab
  const [documentId, setDocumentId] = useState('')
  const [document, setDocument] = useState(null)
  const [docQuery, setDocQuery] = useState('')
  const [docResults, setDocResults] = useState([])
  const [reviews, setReviews] = useState([])
  const [playbooks, setPlaybooks] = useState([])
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('')
  const [running, setRunning] = useState(false)
  const [reviewError, setReviewError] = useState('')

  // Playbooks tab
  const [playbookForm, setPlaybookForm] = useState(emptyPlaybookForm())
  const [pbSubmitting, setPbSubmitting] = useState(false)
  const [pbError, setPbError] = useState('')

  // Drafting tab
  const [activeModules, setActiveModules] = useState([])
  const [draftForm, setDraftForm] = useState(emptyDraftForm())
  const [drafts, setDrafts] = useState([])
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState('')

  const isPrivileged = PRIVILEGED_ROLES.includes(role)
  const canSaveToDocTrack = activeModules.includes('doctrack')

  const loadPlaybooks = async () => {
    const res = await fetch('/api/aitrack/playbooks')
    const result = await res.json()
    if (res.ok) setPlaybooks(result.playbooks || [])
  }

  const loadDrafts = async () => {
    const res = await fetch('/api/aitrack/document-drafts')
    const result = await res.json()
    if (res.ok) setDrafts(result.drafts || [])
  }

  const loadDocument = async (id) => {
    const res = await fetch(`/api/doctrack/documents/detail?id=${id}`)
    const result = await res.json()
    if (res.ok) setDocument(result.document)
  }

  const loadReviews = async (id) => {
    const res = await fetch(`/api/aitrack/document-reviews?document_id=${id}`)
    const result = await res.json()
    if (res.ok) setReviews(result.reviews || [])
  }

  useEffect(() => {
    fetch('/api/layout-data').then((r) => r.json()).then((r) => {
      setRole(r.profile?.role || '')
      setActiveModules(r.activeModules || [])
    })
    loadPlaybooks()
    loadDrafts()
    const params = new URLSearchParams(window.location.search)
    const idFromUrl = params.get('document_id')
    if (idFromUrl) setDocumentId(idFromUrl)
  }, [])

  useEffect(() => {
    if (documentId) {
      loadDocument(documentId)
      loadReviews(documentId)
    } else {
      setDocument(null)
      setReviews([])
    }
  }, [documentId])

  useEffect(() => {
    if (!docQuery) {
      setDocResults([])
      return
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/doctrack/documents?q=${encodeURIComponent(docQuery)}`)
      const result = await res.json()
      if (res.ok) setDocResults((result.documents || []).slice(0, 8))
    }, 250)
    return () => clearTimeout(t)
  }, [docQuery])

  const handleRunReview = async () => {
    setRunning(true)
    setReviewError('')
    const res = await fetch('/api/aitrack/document-reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, playbook_id: selectedPlaybookId || null }),
    })
    const result = await res.json()
    setRunning(false)
    if (!res.ok) {
      setReviewError(result.error || 'Could not run review')
      return
    }
    await loadReviews(documentId)
  }

  const updateRule = (index, patch) => {
    setPlaybookForm((prev) => ({ ...prev, rules: prev.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)) }))
  }
  const addRule = () => setPlaybookForm((prev) => ({ ...prev, rules: [...prev.rules, { label: '', instructions: '' }] }))
  const removeRule = (index) => setPlaybookForm((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }))

  const handlePlaybookSubmit = async (e) => {
    e.preventDefault()
    setPbSubmitting(true)
    setPbError('')

    const { id, ...payload } = playbookForm
    const cleanRules = payload.rules.filter((r) => r.label.trim() && r.instructions.trim())
    const res = await fetch('/api/aitrack/playbooks', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(id ? { id, ...payload, rules: cleanRules } : { ...payload, rules: cleanRules }),
    })
    const result = await res.json()
    setPbSubmitting(false)
    if (!res.ok) {
      setPbError(result.error || 'Could not save playbook')
      return
    }
    setPlaybookForm(emptyPlaybookForm())
    await loadPlaybooks()
  }

  const handleEditPlaybook = (pb) => {
    setPlaybookForm({ id: pb.id, name: pb.name, description: pb.description || '', rules: pb.rules.length ? pb.rules : [{ label: '', instructions: '' }] })
  }

  const handleDeletePlaybook = async (pb) => {
    if (!confirm(`Delete "${pb.name}"? This can't be undone.`)) return
    await fetch(`/api/aitrack/playbooks?id=${pb.id}`, { method: 'DELETE' })
    if (playbookForm.id === pb.id) setPlaybookForm(emptyPlaybookForm())
    await loadPlaybooks()
  }

  const handleGenerateDraft = async (e) => {
    e.preventDefault()
    setDrafting(true)
    setDraftError('')

    const res = await fetch('/api/aitrack/document-drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        document_type: draftForm.document_type,
        matter_id: draftForm.matter_id || null,
        prompt: draftForm.prompt,
      }),
    })
    const result = await res.json()
    setDrafting(false)
    if (!res.ok) {
      setDraftError(result.error || 'Could not generate draft')
      return
    }
    setDraftForm(emptyDraftForm())
    await loadDrafts()
  }

  const TABS = [
    { key: 'reviews', label: 'Document Reviews' },
    { key: 'drafting', label: 'Drafting' },
    { key: 'playbooks', label: 'Playbooks' },
  ]

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">AITrack</h1>
      <p className="text-gray-600 mb-4">AI-assisted document review grounded in a real uploaded file, document drafting, and configurable review playbooks.</p>

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

      {tab === 'reviews' && (
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            {document ? (
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-gray-900">{document.title}</p>
                  <p className="text-xs text-gray-500">{document.matters?.case_name || 'No matter'} · {document.category || 'Uncategorized'}</p>
                </div>
                <button type="button" onClick={() => { setDocumentId(''); setDocQuery('') }} className="text-xs text-blue-600 hover:underline">
                  Change document
                </button>
              </div>
            ) : (
              <div className="relative mb-3">
                <label className="block text-xs text-gray-500 mb-1">Find a document</label>
                <input
                  type="text"
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
                {docResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
                    {docResults.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => { setDocumentId(d.id); setDocQuery(''); setDocResults([]) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <p className="font-medium text-gray-900">{d.title}</p>
                        <p className="text-xs text-gray-500">{d.matters?.case_name || 'No matter'}{d.external_source ? ' · Linked (no local file -- not reviewable)' : ''}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {document && document.external_source && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
                This document is linked from {document.external_source}, not uploaded to FirmTrack -- AI Document Review needs a local file to read, so this document can&apos;t be reviewed.
              </p>
            )}

            {document && !document.external_source && (
              <>
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">Playbook (optional)</label>
                  <select value={selectedPlaybookId} onChange={(e) => setSelectedPlaybookId(e.target.value)} className="w-full sm:w-64 px-2 py-1.5 border rounded text-sm">
                    <option value="">No playbook -- general review only</option>
                    {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {reviewError && <p className="text-red-600 text-xs mb-2">{reviewError}</p>}
                <button type="button" onClick={handleRunReview} disabled={running} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {running ? 'Reviewing... this can take a moment' : 'Run review'}
                </button>
              </>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="space-y-3">
              <p className="font-medium text-gray-900">Review history</p>
              {reviews.map((r) => <ReviewResults key={r.id} review={r} />)}
            </div>
          )}
          {document && !document.external_source && reviews.length === 0 && (
            <p className="text-gray-500 text-sm">No reviews yet for this document.</p>
          )}
        </div>
      )}

      {tab === 'drafting' && (
        <div>
          <form onSubmit={handleGenerateDraft} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 mb-6">
            <p className="font-medium text-gray-900">New draft</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Document type</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NDA, Demand Letter, Engagement Letter"
                  value={draftForm.document_type}
                  onChange={(e) => setDraftForm((p) => ({ ...p, document_type: e.target.value }))}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Matter (optional)</label>
                {draftForm.matter_label ? (
                  <div className="flex items-center justify-between px-2 py-1.5 border rounded text-sm bg-gray-50">
                    <span className="text-gray-700 truncate">{draftForm.matter_label}</span>
                    <button type="button" onClick={() => setDraftForm((p) => ({ ...p, matter_id: '', matter_query: '', matter_label: '' }))} className="text-xs text-blue-600 hover:underline ml-2 shrink-0">
                      Clear
                    </button>
                  </div>
                ) : (
                  <MatterSearchInput
                    value={draftForm.matter_query}
                    onChange={(v) => setDraftForm((p) => ({ ...p, matter_query: v, matter_id: v ? p.matter_id : '' }))}
                    onSelect={(m) => setDraftForm((p) => ({ ...p, matter_id: m.id, matter_query: '', matter_label: `${m.matter_id} · ${m.case_name}` }))}
                    placeholder="Search matter..."
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Instructions</label>
              <textarea
                required
                rows={4}
                placeholder="Describe what to draft -- parties, key terms, purpose. Be specific; the assistant won't invent facts you don't provide."
                value={draftForm.prompt}
                onChange={(e) => setDraftForm((p) => ({ ...p, prompt: e.target.value }))}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
            </div>

            {draftError && <p className="text-red-600 text-xs">{draftError}</p>}
            <button type="submit" disabled={drafting} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {drafting ? 'Drafting... this can take a moment' : 'Generate draft'}
            </button>
            <p className="text-xs text-gray-400">Every draft is a starting point for attorney review, never a finished or filed document.</p>
          </form>

          <p className="font-medium text-gray-900 mb-2">Draft history</p>
          <div className="space-y-3">
            {drafts.length === 0 ? (
              <p className="text-gray-500 text-sm">No drafts yet.</p>
            ) : (
              drafts.map((d) => <DraftResult key={d.id} draft={d} canSaveToDocTrack={canSaveToDocTrack} />)
            )}
          </div>
        </div>
      )}

      {tab === 'playbooks' && (
        <div>
          {isPrivileged && (
            <form onSubmit={handlePlaybookSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 mb-6">
              <p className="font-medium text-gray-900">{playbookForm.id ? 'Edit playbook' : 'New playbook'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input type="text" required value={playbookForm.name} onChange={(e) => setPlaybookForm((p) => ({ ...p, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="e.g. NDA Review Playbook" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                  <input type="text" value={playbookForm.description} onChange={(e) => setPlaybookForm((p) => ({ ...p, description: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Rules</label>
                <div className="space-y-2">
                  {playbookForm.rules.map((rule, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <input
                        type="text"
                        placeholder="Rule label, e.g. Confidentiality definition"
                        value={rule.label}
                        onChange={(e) => updateRule(i, { label: e.target.value })}
                        className="w-48 px-2 py-1.5 border rounded text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Instructions, e.g. Check that confidential information is clearly defined and scoped"
                        value={rule.instructions}
                        onChange={(e) => updateRule(i, { instructions: e.target.value })}
                        className="flex-1 px-2 py-1.5 border rounded text-sm"
                      />
                      {playbookForm.rules.length > 1 && (
                        <button type="button" onClick={() => removeRule(i)} className="text-xs text-red-600 hover:underline py-1.5">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addRule} className="text-sm text-blue-600 hover:underline mt-2">+ Add rule</button>
              </div>

              {pbError && <p className="text-red-600 text-xs">{pbError}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={pbSubmitting} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {pbSubmitting ? 'Saving...' : playbookForm.id ? 'Save changes' : 'Create playbook'}
                </button>
                {playbookForm.id && (
                  <button type="button" onClick={() => setPlaybookForm(emptyPlaybookForm())} className="text-sm text-gray-500 hover:underline">Cancel edit</button>
                )}
              </div>
            </form>
          )}

          <p className="font-medium text-gray-900 mb-2">Playbooks</p>
          <div className="space-y-2">
            {playbooks.length === 0 ? (
              <p className="text-gray-500 text-sm">No playbooks yet.</p>
            ) : (
              playbooks.map((pb) => (
                <div key={pb.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{pb.name}</p>
                    {isPrivileged && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => handleEditPlaybook(pb)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button type="button" onClick={() => handleDeletePlaybook(pb)} className="text-xs text-red-600 hover:underline">Delete</button>
                      </div>
                    )}
                  </div>
                  {pb.description && <p className="text-sm text-gray-600 mt-1">{pb.description}</p>}
                  <p className="text-xs text-gray-500 mt-2">{pb.rules.length} rule{pb.rules.length === 1 ? '' : 's'}: {pb.rules.map((r) => r.label).join(', ')}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
