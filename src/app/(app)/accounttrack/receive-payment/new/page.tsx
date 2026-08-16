// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MatterSearchInput from '@/components/timetrack/matter-search-input'

const emptySpecialLine = (type) => ({ type, matter_id: '', matter_query: '', matter_label: '', amount: '' })

export default function NewReceivePaymentPage() {
  const [cashAccounts, setCashAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [from, setFrom] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('')
  const [explanation, setExplanation] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Check')
  const [checkNumber, setCheckNumber] = useState('')

  const [matterQuery, setMatterQuery] = useState('')
  const [matterId, setMatterId] = useState('')
  const [invoices, setInvoices] = useState([])
  const [invoiceAllocations, setInvoiceAllocations] = useState({}) // invoice_id -> amount string

  const [specialLines, setSpecialLines] = useState([])

  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [allocationResults, setAllocationResults] = useState(null)

  useEffect(() => {
    fetch('/api/accounttrack/chart-of-accounts?cash_only=1')
      .then((r) => r.json())
      .then((r) => setCashAccounts((r.accounts || []).filter((a) => a.key !== 'trust_bank')))
    fetch('/api/accounttrack/recurring-templates?transaction_type=receive_payment')
      .then((r) => r.json())
      .then((r) => setTemplates(r.templates || []))
  }, [])

  useEffect(() => {
    if (!matterId) {
      setInvoices([])
      return
    }
    fetch(`/api/accounttrack/invoices?matter_id=${matterId}`)
      .then((r) => r.json())
      .then((r) => setInvoices((r.invoices || []).filter((inv) => inv.status === 'open' || inv.status === 'partially_paid')))
  }, [matterId])

  const invoiceAllocatedTotal = invoices.reduce((sum, inv) => sum + Number(invoiceAllocations[inv.id] || 0), 0)
  const specialAllocatedTotal = specialLines.reduce((sum, l) => sum + Number(l.amount || 0), 0)
  const totalAllocated = invoiceAllocatedTotal + specialAllocatedTotal
  const unallocated = Number(amount || 0) - totalAllocated

  const addSpecialLine = (type) => setSpecialLines((prev) => [...prev, emptySpecialLine(type)])
  const updateSpecialLine = (index, patch) => setSpecialLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  const removeSpecialLine = (index) => setSpecialLines((prev) => prev.filter((_, i) => i !== index))

  const canSubmit =
    accountId && Number(amount) > 0 && Math.abs(unallocated) < 0.005 &&
    (invoiceAllocatedTotal > 0 || specialLines.length > 0) &&
    specialLines.every((l) => l.matter_id && Number(l.amount) > 0)

  const applyTemplate = (id) => {
    setSelectedTemplateId(id)
    const template = templates.find((t) => t.id === id)
    if (!template) return
    const payload = template.payload || {}
    setAccountId(payload.account_id || '')
    setFrom(payload.from || '')
    setExplanation(payload.explanation || '')
    setSpecialLines((payload.allocations || []).map((a) => ({
      type: a.type, matter_id: a.matter_id || '', matter_query: a.matter_label || '', matter_label: a.matter_label || '', amount: '',
    })))
    fetch('/api/accounttrack/recurring-templates', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, mark_used: true }),
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    setAllocationResults(null)

    const allocations = [
      ...invoices
        .filter((inv) => Number(invoiceAllocations[inv.id] || 0) > 0)
        .map((inv) => ({ type: 'invoice', invoice_id: inv.id, amount: Number(invoiceAllocations[inv.id]) })),
      ...specialLines.map((l) => ({ type: l.type, matter_id: l.matter_id, amount: Number(l.amount) })),
    ]

    const res = await fetch('/api/accounttrack/receive-payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        from,
        date,
        amount: Number(amount),
        explanation,
        payment_method: paymentMethod,
        reference: checkNumber || null,
        allocations,
      }),
    })
    const result = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(result.error || 'Could not record payment')
      if (result.results) setAllocationResults(result.results)
      return
    }

    if (saveAsTemplate && templateName) {
      await fetch('/api/accounttrack/recurring-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          transaction_type: 'receive_payment',
          payload: {
            account_id: accountId,
            from,
            explanation,
            allocations: specialLines.map((l) => ({ type: l.type, matter_id: l.matter_id, matter_label: l.matter_label })),
          },
        }),
      })
    }

    setAllocationResults(result.results)
    setSuccess('Payment recorded.')
    setAmount('')
    setInvoiceAllocations({})
    setSpecialLines([])
    setSaveAsTemplate(false)
    setTemplateName('')
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Receive Payment</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">
          ← AccountTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Allocate one receipt across multiple invoices, plus trust/retainer deposits or a refund hold.
      </p>

      {templates.length > 0 && (
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Use a recurring template</label>
          <select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)} className="px-2 py-1.5 border rounded text-sm w-64">
            <option value="">— none —</option>
            {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deposit to account</label>
            <select required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
              <option value="">Select account...</option>
              {cashAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="text" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Amount received</label>
            <input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm text-right" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Explanation</label>
            <input type="text" value={explanation} onChange={(e) => setExplanation(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Payment method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
              <option>Cash</option>
              <option>Check</option>
              <option>Wire</option>
              <option>Transfer</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reference (optional)</label>
            <input type="text" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
        </div>

        <h2 className="text-sm font-semibold text-gray-900 mb-2">Apply to invoices</h2>
        <div className="w-80 mb-3">
          <MatterSearchInput
            value={matterQuery}
            onChange={(v) => { setMatterQuery(v); if (!v) setMatterId('') }}
            onSelect={(m) => { setMatterId(m.id); setMatterQuery(`${m.matter_id} · ${m.case_name}`) }}
            placeholder="Search matter to load its open invoices..."
          />
        </div>

        {invoices.length > 0 && (
          <div className="border border-gray-200 rounded overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Inv #</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Total</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Paid</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Balance O/S</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-32">Allocate</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const outstanding = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)
                  return (
                    <tr key={inv.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2">{inv.invoice_date}</td>
                      <td className="px-3 py-2">{inv.invoice_number}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(inv.total_amount).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(inv.paid_amount || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{outstanding.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={outstanding}
                          value={invoiceAllocations[inv.id] || ''}
                          onChange={(e) => setInvoiceAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                          className="w-full px-2 py-1 border rounded text-sm text-right"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-3 mb-3">
          <button type="button" onClick={() => addSpecialLine('trust')} className="text-sm text-blue-600 hover:underline">+ Add Trust Transfer</button>
          <button type="button" onClick={() => addSpecialLine('retainer')} className="text-sm text-blue-600 hover:underline">+ Add to Retainer</button>
          <button type="button" onClick={() => addSpecialLine('refund')} className="text-sm text-blue-600 hover:underline">+ Add Refund</button>
        </div>

        {specialLines.length > 0 && (
          <div className="border border-gray-200 rounded overflow-hidden mb-3">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Matter</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">Amount</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {specialLines.map((line, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 capitalize">
                      {line.type === 'trust' ? 'Transfer to Trust' : line.type === 'retainer' ? 'Add to Retainer' : 'Refund to Client'}
                    </td>
                    <td className="px-3 py-2 w-56">
                      <MatterSearchInput
                        value={line.matter_query}
                        onChange={(v) => updateSpecialLine(i, { matter_query: v, matter_id: v ? line.matter_id : '' })}
                        onSelect={(m) => updateSpecialLine(i, { matter_id: m.id, matter_query: `${m.matter_id} · ${m.case_name}`, matter_label: `${m.matter_id} · ${m.case_name}` })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" min="0" value={line.amount} onChange={(e) => updateSpecialLine(i, { amount: e.target.value })} className="w-full px-2 py-1 border rounded text-sm text-right" />
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removeSpecialLine(i)} className="text-xs text-red-600 hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {specialLines.some((l) => l.type === 'refund') && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
            A refund here holds the amount in Trust — it doesn&apos;t send money back to the client. Pay the actual
            refund out later as a General Check from Trust.
          </p>
        )}

        <div className="flex items-center gap-6 mb-4 text-sm">
          <p>Total Allocated: <span className="font-mono font-medium">{totalAllocated.toFixed(2)}</span></p>
          <p className={Math.abs(unallocated) < 0.005 ? 'text-green-600' : 'text-red-600'}>
            Amount Unallocated: <span className="font-mono font-medium">{unallocated.toFixed(2)}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
            Save as recurring template
          </label>
          {saveAsTemplate && (
            <input type="text" placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="px-2 py-1 border rounded text-sm" />
          )}
        </div>

        <button type="submit" disabled={!canSubmit || submitting} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Recording...' : 'Record payment'}
        </button>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        {success && <p className="text-green-600 text-sm mt-3">{success}</p>}

        {allocationResults && (
          <div className="mt-4 border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Allocation</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {allocationResults.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 capitalize">{r.allocation.type} — {Number(r.allocation.amount).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {r.status === 'success' && <span className="text-green-600">Posted</span>}
                      {r.status === 'failed' && <span className="text-red-600">Failed: {r.detail}</span>}
                      {r.status === 'not_attempted' && <span className="text-gray-400">Not attempted</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </form>
    </div>
  )
}
