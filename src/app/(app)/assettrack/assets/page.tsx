// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const ASSETTRACK_STAFF_ROLES = ['owner', 'admin', 'manager']
const ASSET_STATUSES = ['active', 'in_repair', 'loaned', 'retired']

const statusColor = {
  active: 'bg-green-100 text-green-700',
  in_repair: 'bg-amber-100 text-amber-700',
  loaned: 'bg-blue-100 text-blue-700',
  retired: 'bg-gray-100 text-gray-500',
}

const classificationLabel = {
  warranty_active: 'Under warranty',
  new: 'New (≤3yr)',
  old: 'Old (>3yr)',
  review_required: 'Needs review',
}

function classifyLaptop(asset, today = new Date()) {
  if (asset.warranty_end_date && new Date(`${asset.warranty_end_date}T23:59:59`) >= today) return 'warranty_active'
  if (!asset.purchase_date) return 'review_required'
  const newUntil = new Date(asset.purchase_date)
  newUntil.setFullYear(newUntil.getFullYear() + 3)
  return today <= newUntil ? 'new' : 'old'
}

const emptyForm = {
  asset_tag: '', serial_number: '', make: '', model: '',
  purchase_date: '', warranty_end_date: '', replacement_cost: '', asset_status: 'active',
  status_note: '', condition_note: '',
}

export default function AssetTrackAssetsPage() {
  const [role, setRole] = useState('')
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const isStaff = ASSETTRACK_STAFF_ROLES.includes(role)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/assettrack/assets')
    const result = await res.json()
    if (res.ok) setAssets(result.assets || [])
    else setError(result.error || 'Could not load assets')
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const layoutRes = await fetch('/api/layout-data').then((r) => r.json())
      setRole(layoutRes.profile?.role || '')
      await load()
    }
    init()
  }, [])

  const startCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const startEdit = (asset) => {
    setEditingId(asset.id)
    setForm({
      asset_tag: asset.asset_tag || '',
      serial_number: asset.serial_number || '',
      make: asset.make || '',
      model: asset.model || '',
      purchase_date: asset.purchase_date || '',
      warranty_end_date: asset.warranty_end_date || '',
      replacement_cost: asset.replacement_cost ?? '',
      asset_status: asset.asset_status || 'active',
      status_note: asset.status_note || '',
      condition_note: asset.condition_note || '',
    })
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      replacement_cost: form.replacement_cost === '' ? null : Number(form.replacement_cost),
      purchase_date: form.purchase_date || null,
      warranty_end_date: form.warranty_end_date || null,
    }

    const res = await fetch('/api/assettrack/assets', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not save asset')
      setSaving(false)
      return
    }
    setShowForm(false)
    setSaving(false)
    await load()
  }

  const retire = async (id) => {
    const res = await fetch('/api/assettrack/assets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, asset_status: 'retired' }),
    })
    if (res.ok) await load()
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Asset Register</h1>
        <Link href="/assettrack" className="text-sm text-blue-600 hover:underline">← AssetTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Laptops tracked for repair tickets and lifecycle reporting.</p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {isStaff && (
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={startCreate} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">
            Add laptop
          </button>
          <Link href="/assettrack/settings" className="text-sm text-blue-600 hover:underline">
            Sync from SharePoint →
          </Link>
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
          <input required placeholder="Asset tag" value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} className="w-full px-3 py-2 border rounded-md text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="px-3 py-2 border rounded-md text-sm" />
            <input placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="px-3 py-2 border rounded-md text-sm" />
          </div>
          <input placeholder="Serial number" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} className="w-full px-3 py-2 border rounded-md text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Purchase date</label>
              <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Warranty end</label>
              <input type="date" value={form.warranty_end_date} onChange={(e) => setForm({ ...form, warranty_end_date: e.target.value })} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          </div>
          <input type="number" min="0" step="0.01" placeholder="Replacement cost" value={form.replacement_cost} onChange={(e) => setForm({ ...form, replacement_cost: e.target.value })} className="w-full px-3 py-2 border rounded-md text-sm" />
          <select value={form.asset_status} onChange={(e) => setForm({ ...form, asset_status: e.target.value })} className="w-full px-3 py-2 border rounded-md text-sm">
            {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
          </select>
          <input placeholder="Status note (e.g. In Use, Decommissioned)" value={form.status_note} onChange={(e) => setForm({ ...form, status_note: e.target.value })} className="w-full px-3 py-2 border rounded-md text-sm" />
          <textarea placeholder="Condition note" value={form.condition_note} onChange={(e) => setForm({ ...form, condition_note: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add laptop'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:underline">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : assets.length === 0 ? (
        <p className="text-gray-500 text-sm">No laptops registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-white border border-gray-200 rounded-lg">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="px-3 py-2">Asset tag</th>
                <th className="px-3 py-2">Make / model</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Age / warranty</th>
                <th className="px-3 py-2">Notes</th>
                {isStaff && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-gray-900">
                    <Link href={`/assettrack/tickets?asset_id=${a.id}`} className="hover:underline">{a.asset_tag}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{a.make} {a.model}</td>
                  <td className="px-3 py-2 text-gray-700">{a.assignee?.email || a.unresolved_assignee || '—'}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded ${statusColor[a.asset_status]}`}>{a.asset_status.replaceAll('_', ' ')}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-500">{classificationLabel[classifyLaptop(a)]}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[14rem] truncate" title={[a.status_note, a.condition_note].filter(Boolean).join(' — ')}>
                    {[a.status_note, a.condition_note].filter(Boolean).join(' — ') || '—'}
                  </td>
                  {isStaff && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(a)} className="text-xs text-blue-600 hover:underline mr-3">Edit</button>
                      {a.asset_status !== 'retired' && (
                        <button type="button" onClick={() => retire(a.id)} className="text-xs text-red-500 hover:underline">Retire</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
