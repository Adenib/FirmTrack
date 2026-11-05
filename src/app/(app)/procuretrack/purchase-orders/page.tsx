// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const statusColor = {
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-amber-100 text-amber-700',
  received: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-600',
}

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [awardedRfqs, setAwardedRfqs] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [rfqId, setRfqId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [lineDescription, setLineDescription] = useState('')
  const [lineQuantity, setLineQuantity] = useState('1')
  const [lineUnitPrice, setLineUnitPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [poRes, rfqRes, vendorRes] = await Promise.all([
      fetch('/api/procuretrack/purchase-orders').then((r) => r.json()),
      fetch('/api/procuretrack/rfqs?status=awarded').then((r) => r.json()).catch(() => ({ rfqs: [] })),
      fetch('/api/procuretrack/vendors?status=active').then((r) => r.json()),
    ])
    setPurchaseOrders(poRes.purchaseOrders || [])
    setAwardedRfqs((rfqRes.rfqs || []).filter((r) => r.status === 'awarded'))
    setVendors(vendorRes.vendors || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submitFromRfq = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/purchase-orders', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rfq_id: rfqId }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setRfqId(''); await load() }
    setSubmitting(false)
  }

  const submitDirect = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/purchase-orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vendor_id: vendorId,
        lines: [{ description: lineDescription, quantity: Number(lineQuantity), unit_price: Number(lineUnitPrice) }],
      }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setVendorId(''); setLineDescription(''); setLineQuantity('1'); setLineUnitPrice(''); await load() }
    setSubmitting(false)
  }

  const cancelPo = async (id) => {
    const res = await fetch('/api/procuretrack/purchase-orders', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'cancelled' }),
    })
    if (res.ok) await load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Purchase Orders</h1>
      <p className="text-gray-600 mb-6">Issued directly to a vendor from an awarded RFQ, a catalog item, or manually.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <form onSubmit={submitFromRfq} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm">From an awarded RFQ</h2>
          <select required value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Select an awarded RFQ</option>
            {awardedRfqs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Issue PO</button>
        </form>

        <form onSubmit={submitDirect} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm">Direct (e.g. a catalog item)</h2>
          <select required value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Vendor</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input required placeholder="Line description" value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input required type="number" min="1" placeholder="Qty" value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
            <input required type="number" min="0" placeholder="Unit price" value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Issue PO</button>
        </form>
      </div>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {purchaseOrders.map((po) => (
            <div key={po.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900">{po.po_number} -- {po.vendor?.name}</p>
                <p className="text-xs text-gray-500">{Number(po.total_amount).toLocaleString()} {po.currency} {po.department?.name ? `· ${po.department.name}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor[po.status] || 'bg-gray-100 text-gray-600'}`}>{po.status}</span>
                {po.status === 'issued' && <button onClick={() => cancelPo(po.id)} className="text-xs text-gray-500 underline">Cancel</button>}
              </div>
            </div>
          ))}
          {purchaseOrders.length === 0 && <p className="text-sm text-gray-500">No purchase orders yet.</p>}
        </div>
      )}
    </div>
  )
}
