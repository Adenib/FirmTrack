'use client'

import { useEffect, useState } from 'react'

type Invoice = {
  id: string
  invoice_number: string
  invoice_date: string
  total_amount_usd: number
  paid_amount_usd: number
  status: string
  matters: { matter_id: string; case_name: string } | null
}

export default function InvoiceRegister() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/accounttrack/invoices')
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (!ok) setError(body.error || 'Could not load invoices')
        else setInvoices(body.invoices || [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (invoices.length === 0) return <p className="text-gray-500 text-sm">No invoices yet.</p>

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Invoice #</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Matter</th>
            <th className="px-3 py-2 font-medium">Total</th>
            <th className="px-3 py-2 font-medium">Paid</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 text-gray-700">{inv.invoice_number}</td>
              <td className="px-3 py-2 text-gray-700">{inv.invoice_date}</td>
              <td className="px-3 py-2 text-gray-700">{inv.matters?.matter_id || '—'}</td>
              <td className="px-3 py-2 text-gray-700">₦{Number(inv.total_amount_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="px-3 py-2 text-gray-700">₦{Number(inv.paid_amount_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="px-3 py-2">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
                  {inv.status.replace('_', ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
