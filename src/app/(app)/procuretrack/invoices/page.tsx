// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const statusColor = {
  pending_match: 'bg-gray-100 text-gray-600',
  matched: 'bg-green-100 text-green-700',
  mismatched: 'bg-red-100 text-red-600',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [poId, setPoId] = useState('')
  const [selectedPo, setSelectedPo] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [lineQuantities, setLineQuantities] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [reviewNotes, setReviewNotes] = useState({})

  const load = async () => {
    setLoading(true)
    const [invRes, poRes] = await Promise.all([
      fetch('/api/procuretrack/invoices').then((r) => r.json()),
      fetch('/api/procuretrack/purchase-orders').then((r) => r.json()),
    ])
    setInvoices(invRes.invoices || [])
    setPurchaseOrders((poRes.purchaseOrders || []).filter((p) => ['issued', 'partially_received', 'received'].includes(p.status)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const selectPo = async (id) => {
    setPoId(id)
    setLineQuantities({})
    if (!id) { setSelectedPo(null); return }
    const res = await fetch(`/api/procuretrack/purchase-orders?id=${id}`).then((r) => r.json())
    setSelectedPo(res.po)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const lines = (selectedPo?.lines || [])
      .filter((l) => lineQuantities[l.id])
      .map((l) => ({ po_line_id: l.id, description: l.description, quantity: Number(lineQuantities[l.id]), unit_price: Number(l.unit_price) }))

    const res = await fetch('/api/procuretrack/invoices', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ po_id: poId, invoice_number: invoiceNumber, invoice_date: invoiceDate, lines }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setPoId(''); setSelectedPo(null); setInvoiceNumber(''); setInvoiceDate(''); setLineQuantities({}); await load() }
    setSubmitting(false)
  }

  const review = async (id, status) => {
    const res = await fetch('/api/procuretrack/invoices', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status, review_note: reviewNotes[id] || null }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else await load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Invoices</h1>
      <p className="text-gray-600 mb-6">Captured against a PO, automatically 3-way matched against goods received.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <select required value={poId} onChange={(e) => selectPo(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Select a purchase order</option>
          {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number} -- {po.vendor?.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input required type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        {selectedPo && (selectedPo.lines || []).map((line) => (
          <div key={line.id} className="flex justify-between items-center text-sm">
            <span>{line.description} (unit price {Number(line.unit_price).toLocaleString()})</span>
            <input type="number" min="0" placeholder="Qty invoiced"
              onChange={(e) => setLineQuantities((s) => ({ ...s, [line.id]: e.target.value }))}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm w-28" />
          </div>
        ))}
        <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Capture invoice</button>
      </form>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900">{inv.invoice_number} -- {inv.vendor?.name}</p>
                  <p className="text-xs text-gray-500">{Number(inv.total_amount).toLocaleString()} -- PO {inv.po?.po_number}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor[inv.status] || 'bg-gray-100 text-gray-600'}`}>{inv.status}</span>
              </div>
              {inv.match_result && (
                <ul className="mt-2 text-xs text-gray-600 space-y-1">
                  {inv.match_result.lines.map((l, i) => (
                    <li key={i} className={l.status === 'mismatched' ? 'text-red-600' : ''}>
                      {l.description}: {l.status}{l.reasons.length > 0 ? ` -- ${l.reasons.join('; ')}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {inv.status === 'mismatched' && (
                <div className="mt-3 flex gap-2 items-center">
                  <input placeholder="Review note (required to approve)" onChange={(e) => setReviewNotes((s) => ({ ...s, [inv.id]: e.target.value }))}
                    className="border border-gray-300 rounded-md px-2 py-1 text-xs flex-1" />
                  <button onClick={() => review(inv.id, 'approved')} className="bg-green-600 text-white px-3 py-1 rounded-md text-xs hover:bg-green-700">Approve</button>
                  <button onClick={() => review(inv.id, 'rejected')} className="bg-red-600 text-white px-3 py-1 rounded-md text-xs hover:bg-red-700">Reject</button>
                </div>
              )}
            </div>
          ))}
          {invoices.length === 0 && <p className="text-sm text-gray-500">No invoices yet.</p>}
        </div>
      )}
    </div>
  )
}
