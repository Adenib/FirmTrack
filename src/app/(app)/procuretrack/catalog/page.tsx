// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const APPROVER_ROLES = ['owner', 'admin', 'manager']

export default function CatalogPage() {
  const [role, setRole] = useState('')
  const [items, setItems] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [trackInventory, setTrackInventory] = useState(false)
  const [reorderPoint, setReorderPoint] = useState('')
  const [preferredVendorId, setPreferredVendorId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isApprover = APPROVER_ROLES.includes(role)

  const load = async () => {
    setLoading(true)
    const [itemsRes, vendorsRes] = await Promise.all([
      fetch('/api/procuretrack/catalog').then((r) => r.json()),
      fetch('/api/procuretrack/vendors').then((r) => r.json()),
    ])
    setItems(itemsRes.items || [])
    setVendors(vendorsRes.vendors || [])
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

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name, unit_price: unitPrice ? Number(unitPrice) : null, track_inventory: trackInventory,
        reorder_point: reorderPoint ? Number(reorderPoint) : null, preferred_vendor_id: preferredVendorId || null,
      }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setName(''); setUnitPrice(''); setTrackInventory(false); setReorderPoint(''); setPreferredVendorId(''); await load() }
    setSubmitting(false)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Catalog</h1>
      <p className="text-gray-600 mb-6">Pre-approved items -- routine purchases can skip RFQ and go straight to a purchase order.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {isApprover && (
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
            <input type="number" min="0" placeholder="Unit price" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={preferredVendorId} onChange={(e) => setPreferredVendorId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option value="">No preferred vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={trackInventory} onChange={(e) => setTrackInventory(e.target.checked)} /> Track inventory
            </label>
          </div>
          {trackInventory && (
            <input type="number" min="0" placeholder="Reorder point" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          )}
          <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Add item</button>
        </form>
      )}

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900">{i.name}</p>
                <p className="text-xs text-gray-500">
                  {i.unit_price != null ? Number(i.unit_price).toLocaleString() : 'No price set'}
                  {i.preferred_vendor?.name ? ` · ${i.preferred_vendor.name}` : ''}
                  {i.track_inventory ? ` · ${i.on_hand_quantity} on hand (reorder at ${i.reorder_point})` : ''}
                </p>
              </div>
              {!i.is_active && <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">inactive</span>}
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-gray-500">No catalog items yet.</p>}
        </div>
      )}
    </div>
  )
}
