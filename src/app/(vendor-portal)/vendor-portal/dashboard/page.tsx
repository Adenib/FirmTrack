// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function VendorPortalDashboardPage() {
  const [invitations, setInvitations] = useState([])
  const [myQuotes, setMyQuotes] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [quoteForms, setQuoteForms] = useState({})
  const [invoiceForm, setInvoiceForm] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [rfqRes, poRes, invRes] = await Promise.all([
      fetch('/api/procuretrack/portal/rfqs').then((r) => r.json()),
      fetch('/api/procuretrack/portal/purchase-orders').then((r) => r.json()),
      fetch('/api/procuretrack/portal/invoices').then((r) => r.json()),
    ])
    if (rfqRes.error) { setError(rfqRes.error); setLoading(false); return }
    setInvitations(rfqRes.invitations || [])
    setMyQuotes(rfqRes.myQuotes || [])
    setPurchaseOrders(poRes.purchaseOrders || [])
    setInvoices(invRes.invoices || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const hasQuoted = (rfqId) => myQuotes.some((q) => q.rfq_id === rfqId)

  const submitQuote = async (rfqId) => {
    setSubmitting(true)
    setError('')
    const form = quoteForms[rfqId] || {}
    const res = await fetch('/api/procuretrack/portal/quotes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rfq_id: rfqId, unit_price: Number(form.unitPrice), quantity: Number(form.quantity || 1), lead_time_days: form.leadTime ? Number(form.leadTime) : null }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else await load()
    setSubmitting(false)
  }

  const submitInvoice = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const form = new FormData()
    form.append('po_id', invoiceForm.poId || '')
    form.append('invoice_number', invoiceForm.invoiceNumber || '')
    form.append('invoice_date', invoiceForm.invoiceDate || '')
    form.append('total_amount', invoiceForm.totalAmount || '')
    if (invoiceForm.file) form.append('file', invoiceForm.file)

    const res = await fetch('/api/procuretrack/portal/invoices', { method: 'POST', body: form })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setInvoiceForm({}); await load() }
    setSubmitting(false)
  }

  if (loading) return <div className="p-8"><p className="text-gray-500 text-sm">Loading...</p></div>
  if (error && invitations.length === 0 && purchaseOrders.length === 0) {
    return <div className="p-8"><p className="text-sm text-red-600">{error}</p></div>
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Vendor Portal</h1>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <section className="mb-8">
        <h2 className="font-semibold text-gray-900 mb-3">RFQ invitations</h2>
        <div className="space-y-3">
          {invitations.map((inv) => (
            <div key={inv.rfq.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <p className="font-medium text-gray-900">{inv.rfq.title}</p>
                <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">{inv.rfq.status}</span>
              </div>
              {hasQuoted(inv.rfq.id) ? (
                <p className="text-xs text-green-700">Quote submitted</p>
              ) : inv.rfq.status === 'open' ? (
                <div className="flex gap-2">
                  <input placeholder="Unit price" onChange={(e) => setQuoteForms((s) => ({ ...s, [inv.rfq.id]: { ...s[inv.rfq.id], unitPrice: e.target.value } }))} className="border border-gray-300 rounded-md px-2 py-1 text-xs w-24" />
                  <input placeholder="Qty" onChange={(e) => setQuoteForms((s) => ({ ...s, [inv.rfq.id]: { ...s[inv.rfq.id], quantity: e.target.value } }))} className="border border-gray-300 rounded-md px-2 py-1 text-xs w-16" />
                  <input placeholder="Lead time (days)" onChange={(e) => setQuoteForms((s) => ({ ...s, [inv.rfq.id]: { ...s[inv.rfq.id], leadTime: e.target.value } }))} className="border border-gray-300 rounded-md px-2 py-1 text-xs w-28" />
                  <button disabled={submitting} onClick={() => submitQuote(inv.rfq.id)} className="bg-blue-600 text-white px-3 py-1 rounded-md text-xs hover:bg-blue-700 disabled:opacity-50">Submit quote</button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No longer open for quotes</p>
              )}
            </div>
          ))}
          {invitations.length === 0 && <p className="text-sm text-gray-500">No RFQ invitations yet.</p>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-semibold text-gray-900 mb-3">Your purchase orders</h2>
        <div className="space-y-3">
          {purchaseOrders.map((po) => (
            <div key={po.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center">
              <p className="font-medium text-gray-900">{po.po_number}</p>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{po.status}</span>
            </div>
          ))}
          {purchaseOrders.length === 0 && <p className="text-sm text-gray-500">No purchase orders yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-gray-900 mb-3">Submit an invoice</h2>
        <form onSubmit={submitInvoice} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 mb-4">
          <select required value={invoiceForm.poId || ''} onChange={(e) => setInvoiceForm((s) => ({ ...s, poId: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Select a purchase order</option>
            {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Invoice number" value={invoiceForm.invoiceNumber || ''} onChange={(e) => setInvoiceForm((s) => ({ ...s, invoiceNumber: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
            <input required type="date" value={invoiceForm.invoiceDate || ''} onChange={(e) => setInvoiceForm((s) => ({ ...s, invoiceDate: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <input required type="number" min="0" placeholder="Total amount" value={invoiceForm.totalAmount || ''} onChange={(e) => setInvoiceForm((s) => ({ ...s, totalAmount: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input type="file" onChange={(e) => setInvoiceForm((s) => ({ ...s, file: e.target.files?.[0] }))} className="w-full text-sm" />
          <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Submit invoice</button>
        </form>
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between text-sm">
              <span>{inv.invoice_number} -- {inv.po?.po_number}</span>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{inv.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
