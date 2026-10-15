// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const ASSETTRACK_STAFF_ROLES = ['owner', 'admin', 'manager']

const CATEGORIES = [
  { value: 'software', label: 'Software' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'charger_power', label: 'Charger / Power' },
  { value: 'performance', label: 'Slow performance' },
  { value: 'physical_damage', label: 'Physical damage' },
  { value: 'other', label: 'Other' },
]
const IMPACTS = [
  { value: 'low', label: 'Low — minor inconvenience' },
  { value: 'normal', label: 'Normal — work affected' },
  { value: 'high', label: 'High — significant disruption' },
  { value: 'critical', label: 'Critical — unable to work' },
]
const STAFF_STATUSES = [
  'submitted', 'triage', 'remote_support', 'awaiting_device', 'diagnosis',
  'awaiting_approval', 'awaiting_parts', 'vendor_repair', 'testing',
  'ready_for_collection', 'returned', 'closed', 'replacement_recommended', 'cancelled',
]
const DECISIONS = ['pending', 'repair', 'replace', 'warranty']

const label = (value) => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const statusColor = {
  submitted: 'bg-gray-100 text-gray-600',
  triage: 'bg-amber-100 text-amber-700',
  closed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  replacement_recommended: 'bg-purple-100 text-purple-700',
}
const statusClass = (s) => statusColor[s] || 'bg-blue-100 text-blue-700'

const recommendationLabel = {
  repair_review: 'Within policy to repair',
  manager_review: 'Manager review suggested (40–60% of replacement cost)',
  replacement_review: 'Replacement suggested (over 60% of replacement cost)',
  insufficient_data: 'Enter both cost estimates for a recommendation',
}

export default function AssetTrackTicketsPage() {
  const [role, setRole] = useState('')
  const [assets, setAssets] = useState([])
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [assetId, setAssetId] = useState('')
  const [assetSearch, setAssetSearch] = useState('')
  const [category, setCategory] = useState('hardware')
  const [impact, setImpact] = useState('normal')
  const [description, setDescription] = useState('')
  const [notifyEmail, setNotifyEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [drafts, setDrafts] = useState({})

  const isStaff = ASSETTRACK_STAFF_ROLES.includes(role)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/assettrack/tickets')
    const result = await res.json()
    if (res.ok) setTickets(result.tickets || [])
    else setError(result.error || 'Could not load tickets')
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const [layoutRes, assetsRes] = await Promise.all([
        fetch('/api/layout-data').then((r) => r.json()),
        fetch('/api/assettrack/assets').then((r) => r.json()),
      ])
      setRole(layoutRes.profile?.role || '')
      setNotifyEmail(layoutRes.profile?.email || '')
      setAssets(assetsRes.assets || [])
      await load()
    }
    init()
  }, [])

  const draftFor = (id) => drafts[id] || {}
  const setDraft = (id, field, value) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const submitRequest = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/assettrack/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ asset_id: assetId || null, category, impact, issue_description: description, notify_email: notifyEmail.trim() || null }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not submit request')
      setSubmitting(false)
      return
    }
    setMessage(`Ticket submitted. Reference: AT-${result.ticket.id.slice(0, 8).toUpperCase()}`)
    setAssetId('')
    setCategory('hardware')
    setImpact('normal')
    setDescription('')
    setSubmitting(false)
    await load()
  }

  const patchTicket = async (id, patch) => {
    setError('')
    const res = await fetch('/api/assettrack/tickets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not update ticket')
      return
    }
    if (result.assessment && result.assessment.recommendation !== 'insufficient_data') {
      setMessage(recommendationLabel[result.assessment.recommendation])
    }
    await load()
  }

  const confirmReceipt = (id) => patchTicket(id, { user_confirmed: true })
  const cancelOwn = (id) => patchTicket(id, { status: 'cancelled' })

  const saveStaffUpdate = (id) => {
    const draft = draftFor(id)
    const patch = {}
    for (const field of ['status', 'triage_notes', 'diagnosis', 'estimated_repair_cost', 'estimated_replacement_cost', 'decision', 'vendor_name', 'parts_status', 'resolution_notes']) {
      if (draft[field] !== undefined && draft[field] !== '') {
        patch[field] = ['estimated_repair_cost', 'estimated_replacement_cost'].includes(field) ? Number(draft[field]) : draft[field]
      }
    }
    if (draft.data_backed_up !== undefined) patch.data_backed_up = draft.data_backed_up
    if (Object.keys(patch).length === 0) return
    patchTicket(id, patch)
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">AssetTrack Tickets</h1>
        <Link href="/assettrack" className="text-sm text-blue-600 hover:underline">← AssetTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Report a laptop problem and track it through to resolution.</p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {message && <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-3 py-2 mb-4">{message}</p>}

      <section className="bg-white border border-gray-200 rounded-lg p-5 mb-8 max-w-lg">
        <h2 className="font-semibold text-gray-900 mb-3">Report a laptop problem</h2>
        <form onSubmit={submitRequest} className="space-y-3">
          <input
            type="text"
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
            placeholder="Search by your name or the laptop's tag/model..."
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" size={assetSearch ? 6 : undefined}>
            <option value="">Which laptop? (optional)</option>
            {assets
              .filter((a) => {
                if (!assetSearch.trim()) return true
                const q = assetSearch.trim().toLowerCase()
                return [a.asset_tag, a.make, a.model, a.assignee_name, a.assignee?.email]
                  .filter(Boolean)
                  .some((field) => field.toLowerCase().includes(q))
              })
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.asset_tag} — {a.make} {a.model}{a.assignee_name ? ` (${a.assignee_name})` : ''}
                </option>
              ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select value={impact} onChange={(e) => setImpact(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
            {IMPACTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <textarea
            required
            minLength={10}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the symptoms, when they started, and any error messages."
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email for updates on this ticket</label>
            <input
              type="email"
              required
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="you@yourfirm.com"
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Submitting...' : 'Submit ticket'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-semibold text-gray-900 mb-3">{isStaff ? 'All tickets' : 'My tickets'}</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : tickets.length === 0 ? (
          <p className="text-gray-500 text-sm">No tickets yet.</p>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <article key={t.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <p className="font-semibold text-gray-900">AT-{t.id.slice(0, 8).toUpperCase()}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusClass(t.status)}`}>{label(t.status)}</span>
                </div>
                <p className="text-sm text-gray-700">
                  {t.asset ? `${t.asset.asset_tag} — ${t.asset.make} ${t.asset.model}` : 'No device linked'}
                  {isStaff && t.reporter?.email ? ` · ${t.reporter.email}` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-1">{label(t.category)} · {label(t.impact)} impact</p>
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{t.issue_description}</p>
                {t.diagnosis && <p className="text-sm text-gray-600 mt-2"><span className="font-medium">Diagnosis:</span> {t.diagnosis}</p>}
                {t.resolution_notes && <p className="text-sm text-gray-600 mt-1"><span className="font-medium">Resolution:</span> {t.resolution_notes}</p>}
                {isStaff && t.decision && t.decision !== 'pending' && (
                  <p className="text-xs text-gray-500 mt-1">Decision: {label(t.decision)}{t.vendor_name ? ` via ${t.vendor_name}` : ''}</p>
                )}

                {!isStaff && t.status === 'returned' && (
                  <button type="button" onClick={() => confirmReceipt(t.id)} className="mt-3 text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700">
                    Confirm laptop received
                  </button>
                )}
                {!isStaff && !['closed', 'cancelled', 'returned'].includes(t.status) && (
                  <button type="button" onClick={() => cancelOwn(t.id)} className="mt-3 ml-2 text-xs text-red-500 hover:underline">
                    Cancel ticket
                  </button>
                )}

                {isStaff && (
                  <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <select
                      value={draftFor(t.id).status ?? t.status}
                      onChange={(e) => setDraft(t.id, 'status', e.target.value)}
                      className="px-2 py-1.5 border rounded text-xs"
                    >
                      {STAFF_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                    <select
                      value={draftFor(t.id).decision ?? t.decision ?? 'pending'}
                      onChange={(e) => setDraft(t.id, 'decision', e.target.value)}
                      className="px-2 py-1.5 border rounded text-xs"
                    >
                      {DECISIONS.map((d) => <option key={d} value={d}>{label(d)}</option>)}
                    </select>
                    <input
                      type="text"
                      placeholder="Vendor (if external)"
                      defaultValue={t.vendor_name || ''}
                      onChange={(e) => setDraft(t.id, 'vendor_name', e.target.value)}
                      className="px-2 py-1.5 border rounded text-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Est. repair cost"
                      defaultValue={t.estimated_repair_cost ?? ''}
                      onChange={(e) => setDraft(t.id, 'estimated_repair_cost', e.target.value)}
                      className="px-2 py-1.5 border rounded text-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Est. replacement cost"
                      defaultValue={t.estimated_replacement_cost ?? ''}
                      onChange={(e) => setDraft(t.id, 'estimated_replacement_cost', e.target.value)}
                      className="px-2 py-1.5 border rounded text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Parts status"
                      defaultValue={t.parts_status || ''}
                      onChange={(e) => setDraft(t.id, 'parts_status', e.target.value)}
                      className="px-2 py-1.5 border rounded text-xs"
                    />
                    <textarea
                      placeholder="Diagnosis"
                      defaultValue={t.diagnosis || ''}
                      onChange={(e) => setDraft(t.id, 'diagnosis', e.target.value)}
                      rows={2}
                      className="col-span-2 sm:col-span-3 px-2 py-1.5 border rounded text-xs"
                    />
                    <textarea
                      placeholder="Resolution notes (required to mark Returned)"
                      defaultValue={t.resolution_notes || ''}
                      onChange={(e) => setDraft(t.id, 'resolution_notes', e.target.value)}
                      rows={2}
                      className="col-span-2 sm:col-span-3 px-2 py-1.5 border rounded text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => saveStaffUpdate(t.id)}
                      className="col-span-2 sm:col-span-3 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 w-fit"
                    >
                      Save update
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
