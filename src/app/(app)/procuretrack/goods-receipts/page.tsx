// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function GoodsReceiptsPage() {
  const [receipts, setReceipts] = useState([])
  const [openPos, setOpenPos] = useState([])
  const [selectedPoId, setSelectedPoId] = useState('')
  const [selectedPo, setSelectedPo] = useState(null)
  const [lineQuantities, setLineQuantities] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [receiptsRes, poRes] = await Promise.all([
      fetch('/api/procuretrack/goods-receipts').then((r) => r.json()),
      fetch('/api/procuretrack/purchase-orders').then((r) => r.json()),
    ])
    setReceipts(receiptsRes.receipts || [])
    setOpenPos((poRes.purchaseOrders || []).filter((p) => ['issued', 'partially_received'].includes(p.status)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const selectPo = async (poId) => {
    setSelectedPoId(poId)
    setLineQuantities({})
    if (!poId) { setSelectedPo(null); return }
    const res = await fetch(`/api/procuretrack/purchase-orders?id=${poId}`).then((r) => r.json())
    setSelectedPo(res.po)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const lines = Object.entries(lineQuantities)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([poLineId, qty]) => ({ po_line_id: poLineId, quantity_received: Number(qty) }))
    if (lines.length === 0) { setError('Enter at least one received quantity'); setSubmitting(false); return }

    const res = await fetch('/api/procuretrack/goods-receipts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ po_id: selectedPoId, lines }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setSelectedPoId(''); setSelectedPo(null); setLineQuantities({}); await load() }
    setSubmitting(false)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Goods Receipts</h1>
      <p className="text-gray-600 mb-6">Record what actually arrived against an open purchase order, including partial deliveries.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <select value={selectedPoId} onChange={(e) => selectPo(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Select an open purchase order</option>
          {openPos.map((po) => <option key={po.id} value={po.id}>{po.po_number} -- {po.vendor?.name}</option>)}
        </select>
        {selectedPo && (
          <div className="space-y-2">
            {(selectedPo.lines || []).map((line) => (
              <div key={line.id} className="flex justify-between items-center text-sm">
                <span>{line.description} (ordered {line.quantity})</span>
                <input type="number" min="0" max={line.quantity} placeholder="Qty received"
                  onChange={(e) => setLineQuantities((s) => ({ ...s, [line.id]: e.target.value }))}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm w-28" />
              </div>
            ))}
            <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Record receipt</button>
          </div>
        )}
      </form>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {receipts.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-900">{r.received_by_user?.email} -- {new Date(r.received_at).toLocaleDateString()}</p>
              <span className={`text-xs px-2 py-1 rounded-full ${r.status === 'full' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
            </div>
          ))}
          {receipts.length === 0 && <p className="text-sm text-gray-500">No goods receipts yet.</p>}
        </div>
      )}
    </div>
  )
}
