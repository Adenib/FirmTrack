// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function fmtAmount(n) {
  return `₦${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

const STATUSES = ['open', 'partially_paid', 'paid', 'void']

export default function BillTrackPage() {
  const [invoices, setInvoices] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [paymentByInvoice, setPaymentByInvoice] = useState({})

  const load = async (status) => {
    setLoading(true)
    setError('')
    const qs = status ? `?status=${status}` : ''
    const res = await fetch(`/api/billtrack/invoices${qs}`)
    const result = await res.json()
    if (res.ok) setInvoices(result.invoices || [])
    else setError(result.error || 'Could not load invoices')
    setLoading(false)
  }

  useEffect(() => {
    load(statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const clearActionError = (id) => setActionError((prev) => ({ ...prev, [id]: '' }))

  const handleSendNow = async (invoice) => {
    setBusyId(invoice.id)
    clearActionError(invoice.id)
    const kind = invoice.last_reminder ? 'reminder' : 'initial'
    const res = await fetch('/api/billtrack/invoices/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoice.id, kind }),
    })
    const result = await res.json()
    if (!res.ok) setActionError((prev) => ({ ...prev, [invoice.id]: result.error }))
    else await load(statusFilter)
    setBusyId(null)
  }

  const handleTogglePause = async (invoice) => {
    setBusyId(invoice.id)
    clearActionError(invoice.id)
    const res = await fetch('/api/billtrack/invoices/pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoice.id, paused: !invoice.reminders_paused }),
    })
    const result = await res.json()
    if (!res.ok) setActionError((prev) => ({ ...prev, [invoice.id]: result.error }))
    else await load(statusFilter)
    setBusyId(null)
  }

  const handleRecordPayment = async (invoice) => {
    const amount = Number(paymentByInvoice[invoice.id])
    if (!amount || amount <= 0) return
    setBusyId(invoice.id)
    clearActionError(invoice.id)
    const res = await fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: invoice.id, payment_amount: amount }),
    })
    const result = await res.json()
    if (!res.ok) setActionError((prev) => ({ ...prev, [invoice.id]: result.error }))
    else {
      setPaymentByInvoice((prev) => ({ ...prev, [invoice.id]: '' }))
      await load(statusFilter)
    }
    setBusyId(null)
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">BillTrack</h1>
        <div className="flex items-center gap-4">
          <Link href="/billtrack/reports" className="text-sm text-blue-600 hover:underline">
            Reports →
          </Link>
          <Link href="/billtrack/settings" className="text-sm text-blue-600 hover:underline">
            Settings →
          </Link>
        </div>
      </div>
      <p className="text-gray-600 mb-6">
        Firmwide invoices — send notifications, track reminders, and record payments without leaving BillTrack.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : invoices.length === 0 ? (
        <p className="text-gray-500 text-sm">No invoices found.</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const matter = Array.isArray(inv.matters) ? inv.matters[0] : inv.matters
            const client = matter ? (Array.isArray(matter.clients) ? matter.clients[0] : matter.clients) : null
            const canRecordPayment = inv.status !== 'paid' && inv.status !== 'void'

            return (
              <div key={inv.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {inv.invoice_number} · {matter?.case_name || 'Unknown matter'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {client?.name ? `${client.name} · ` : ''}
                      {client?.email || 'No client email on file'}
                    </p>
                  </div>
                  {inv.reminders_paused && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Reminders paused</span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Total</p>
                    <p className="text-sm text-gray-900">{fmtAmount(inv.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Paid</p>
                    <p className="text-sm text-gray-900">{fmtAmount(inv.paid_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Status</p>
                    <p className="text-sm text-gray-900 capitalize">{inv.status.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Due</p>
                    <p className="text-sm text-gray-900">{fmtDate(inv.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Last sent</p>
                    <p className="text-sm text-gray-900">
                      {inv.last_reminder ? `${fmtDate(inv.last_reminder.sent_at)} (${inv.last_reminder.kind})` : 'Never'}
                    </p>
                  </div>
                </div>

                {actionError[inv.id] && <p className="text-red-600 text-xs mb-2">{actionError[inv.id]}</p>}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={busyId === inv.id || inv.status === 'void'}
                    onClick={() => handleSendNow(inv)}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {inv.last_reminder ? 'Send reminder now' : 'Send now'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === inv.id || inv.status === 'void'}
                    onClick={() => handleTogglePause(inv)}
                    className="text-xs border px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {inv.reminders_paused ? 'Resume reminders' : 'Pause reminders'}
                  </button>
                  {canRecordPayment && (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Payment"
                        value={paymentByInvoice[inv.id] || ''}
                        onChange={(e) => setPaymentByInvoice((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                        className="w-24 px-2 py-1 border rounded text-xs"
                      />
                      <button
                        type="button"
                        disabled={busyId === inv.id}
                        onClick={() => handleRecordPayment(inv)}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Record payment
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
