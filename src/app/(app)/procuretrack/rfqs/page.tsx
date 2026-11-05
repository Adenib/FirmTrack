// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function RfqsPage() {
  const [rfqs, setRfqs] = useState([])
  const [requisitions, setRequisitions] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [requisitionId, setRequisitionId] = useState('')
  const [title, setTitle] = useState('')
  const [invitedVendorIds, setInvitedVendorIds] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [quoteForms, setQuoteForms] = useState({})
  const [reasonDrafts, setReasonDrafts] = useState({})

  const load = async () => {
    setLoading(true)
    const [rfqRes, reqRes, vendorRes] = await Promise.all([
      fetch('/api/procuretrack/rfqs').then((r) => r.json()),
      fetch('/api/procuretrack/requisitions?status=approved').then((r) => r.json()),
      fetch('/api/procuretrack/vendors?status=active').then((r) => r.json()),
    ])
    setRfqs(rfqRes.rfqs || [])
    setRequisitions(reqRes.requisitions || [])
    setVendors(vendorRes.vendors || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/rfqs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requisition_id: requisitionId, title, vendor_ids: invitedVendorIds }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setRequisitionId(''); setTitle(''); setInvitedVendorIds([]); await load() }
    setSubmitting(false)
  }

  const recordQuote = async (rfqId) => {
    const form = quoteForms[rfqId] || {}
    const res = await fetch(`/api/procuretrack/rfqs/${rfqId}/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vendor_id: form.vendorId, unit_price: Number(form.unitPrice), quantity: Number(form.quantity || 1) }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setQuoteForms((s) => ({ ...s, [rfqId]: {} })); await load() }
  }

  const selectQuote = async (rfqId, quoteId) => {
    const reason = reasonDrafts[quoteId]
    if (!reason) { setError('A selection reason is required'); return }
    const res = await fetch(`/api/procuretrack/rfqs/${rfqId}/quotes`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quote_id: quoteId, selection_reason: reason }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else await load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">RFQs</h1>
      <p className="text-gray-600 mb-6">Source quotes from multiple vendors and select one with a written reason.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <h2 className="font-semibold text-gray-900">New RFQ</h2>
        <select required value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Select an approved requisition</option>
          {requisitions.map((r) => <option key={r.id} value={r.id}>{r.item_description} &times; {r.quantity}</option>)}
        </select>
        <input required placeholder="RFQ title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          {vendors.map((v) => (
            <label key={v.id} className="flex items-center gap-1 text-sm border border-gray-200 rounded-md px-2 py-1">
              <input type="checkbox" checked={invitedVendorIds.includes(v.id)}
                onChange={(e) => setInvitedVendorIds((ids) => e.target.checked ? [...ids, v.id] : ids.filter((id) => id !== v.id))} />
              {v.name}
            </label>
          ))}
        </div>
        <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Create RFQ</button>
      </form>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-4">
          {rfqs.map((rfq) => (
            <div key={rfq.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-gray-900">{rfq.title}</p>
                <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">{rfq.status}</span>
              </div>
              <div className="space-y-2 mb-3">
                {(rfq.quotes || []).map((q) => (
                  <div key={q.id} className="flex justify-between items-center border-t border-gray-100 pt-2">
                    <div>
                      <p className="text-sm text-gray-900">{q.vendor?.name}: {Number(q.unit_price).toLocaleString()} &times; {q.quantity} = {Number(q.total_price).toLocaleString()}</p>
                      {q.is_selected && <p className="text-xs text-green-700">Selected: {q.selection_reason}</p>}
                    </div>
                    {rfq.status === 'open' && !q.is_selected && (
                      <div className="flex gap-2 items-center">
                        <input placeholder="Reason" onChange={(e) => setReasonDrafts((s) => ({ ...s, [q.id]: e.target.value }))} className="border border-gray-300 rounded-md px-2 py-1 text-xs" />
                        <button onClick={() => selectQuote(rfq.id, q.id)} className="bg-green-600 text-white px-2 py-1 rounded-md text-xs hover:bg-green-700">Select</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {rfq.status === 'open' && (
                <div className="flex gap-2 items-center border-t border-gray-100 pt-3">
                  <select onChange={(e) => setQuoteForms((s) => ({ ...s, [rfq.id]: { ...s[rfq.id], vendorId: e.target.value } }))} className="border border-gray-300 rounded-md px-2 py-1 text-xs">
                    <option value="">Vendor</option>
                    {(rfq.invited_vendors || []).map((iv) => <option key={iv.vendor_id} value={iv.vendor_id}>{iv.vendor?.name}</option>)}
                  </select>
                  <input placeholder="Unit price" onChange={(e) => setQuoteForms((s) => ({ ...s, [rfq.id]: { ...s[rfq.id], unitPrice: e.target.value } }))} className="border border-gray-300 rounded-md px-2 py-1 text-xs w-24" />
                  <input placeholder="Qty" onChange={(e) => setQuoteForms((s) => ({ ...s, [rfq.id]: { ...s[rfq.id], quantity: e.target.value } }))} className="border border-gray-300 rounded-md px-2 py-1 text-xs w-16" />
                  <button onClick={() => recordQuote(rfq.id)} className="border border-gray-300 text-gray-700 px-2 py-1 rounded-md text-xs hover:bg-gray-50">Record quote</button>
                </div>
              )}
            </div>
          ))}
          {rfqs.length === 0 && <p className="text-sm text-gray-500">No RFQs yet.</p>}
        </div>
      )}
    </div>
  )
}
