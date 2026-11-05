// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [payableInvoices, setPayableInvoices] = useState([])
  const [invoiceId, setInvoiceId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [payRes, invRes] = await Promise.all([
      fetch('/api/procuretrack/payments').then((r) => r.json()),
      fetch('/api/procuretrack/invoices').then((r) => r.json()),
    ])
    setPayments(payRes.payments || [])
    setPayableInvoices((invRes.invoices || []).filter((i) => ['matched', 'approved'].includes(i.status)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/payments', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoiceId, payment_method: paymentMethod || null, reference: reference || null }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setInvoiceId(''); setPaymentMethod(''); setReference(''); await load() }
    setSubmitting(false)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Payments</h1>
      <p className="text-gray-600 mb-6">Posts a real ledger entry in AccountTrack (debit Operating Expenses, credit Operating Cash).</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <select required value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Select an invoice to pay</option>
          {payableInvoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number} -- {Number(i.total_amount).toLocaleString()}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Pay invoice</button>
      </form>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between">
              <p className="text-sm text-gray-900">{p.invoice?.invoice_number} -- {Number(p.amount).toLocaleString()}</p>
              <p className="text-xs text-gray-500">{new Date(p.paid_at).toLocaleDateString()} {p.reference ? `· ${p.reference}` : ''}</p>
            </div>
          ))}
          {payments.length === 0 && <p className="text-sm text-gray-500">No payments yet.</p>}
        </div>
      )}
    </div>
  )
}
