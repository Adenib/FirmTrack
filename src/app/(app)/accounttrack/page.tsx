// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MatterSearchInput from '@/components/timetrack/matter-search-input'
import MatterSummaryCard from '@/components/timetrack/matter-summary-card'

function fmtAmount(n, currency) {
  const formatted = Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency && currency !== 'NGN' ? `${currency} ${formatted}` : `₦${formatted}`
}

export default function AccountTrackPage() {
  const [matterQuery, setMatterQuery] = useState('')
  const [matterId, setMatterId] = useState('')

  const [unbilledEntries, setUnbilledEntries] = useState([])
  const [disbursements, setDisbursements] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [disbDate, setDisbDate] = useState('')
  const [disbDescription, setDisbDescription] = useState('')
  const [disbAmount, setDisbAmount] = useState('')

  const [ledgerType, setLedgerType] = useState('trust')
  const [ledgerAmount, setLedgerAmount] = useState('')
  const [ledgerDescription, setLedgerDescription] = useState('')

  const [selectedEntryIds, setSelectedEntryIds] = useState([])
  const [selectedDisbIds, setSelectedDisbIds] = useState([])

  const [paymentByInvoice, setPaymentByInvoice] = useState({})

  const [matterBudget, setMatterBudget] = useState(null)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetTarget, setBudgetTarget] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)

  const loadAll = async (id) => {
    if (!id) return
    setLoading(true)
    setError('')

    const [draftRes, submittedRes, disbRes, ledgerRes, invoicesRes, budgetsRes] = await Promise.all([
      fetch(`/api/timetrack/entries?matter_id=${id}&entry_type=timesheet&status=draft`),
      fetch(`/api/timetrack/entries?matter_id=${id}&entry_type=timesheet&status=submitted`),
      fetch(`/api/accounttrack/disbursements?matter_id=${id}`),
      fetch(`/api/accounttrack/trust-ledger?matter_id=${id}`),
      fetch(`/api/accounttrack/invoices?matter_id=${id}`),
      fetch(`/api/accounttrack/budgets?matter_id=${id}`),
    ])

    const [draft, submitted, disb, ledger, inv, budgets] = await Promise.all([
      draftRes.json(), submittedRes.json(), disbRes.json(), ledgerRes.json(), invoicesRes.json(), budgetsRes.json(),
    ])

    const entries = [...(draft.entries || []), ...(submitted.entries || [])].filter((e) => e.billable !== false)
    setUnbilledEntries(entries)
    setDisbursements((disb.disbursements || []).filter((d) => !d.billed))
    setLedgerEntries(ledger.entries || [])
    setInvoices(inv.invoices || [])
    setMatterBudget((budgets.budgets || [])[0] || null)
    setSelectedEntryIds([])
    setSelectedDisbIds([])
    setEditingBudget(false)
    setLoading(false)
  }

  useEffect(() => {
    loadAll(matterId)
  }, [matterId])

  const handleAddDisbursement = async (e) => {
    e.preventDefault()
    setError('')
    const response = await fetch('/api/accounttrack/disbursements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        matter_id: matterId,
        disb_date: disbDate || null,
        description: disbDescription || null,
        amount: parseFloat(disbAmount) || 0,
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not add disbursement')
      return
    }
    setDisbDate('')
    setDisbDescription('')
    setDisbAmount('')
    await loadAll(matterId)
  }

  const handleAddLedgerEntry = async (e) => {
    e.preventDefault()
    setError('')
    const response = await fetch('/api/accounttrack/trust-ledger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        matter_id: matterId,
        ledger_type: ledgerType,
        amount: parseFloat(ledgerAmount) || 0,
        description: ledgerDescription || null,
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not add ledger entry')
      return
    }
    setLedgerAmount('')
    setLedgerDescription('')
    await loadAll(matterId)
  }

  const handleCreateInvoice = async () => {
    setError('')
    if (selectedEntryIds.length === 0 && selectedDisbIds.length === 0) {
      setError('Select at least one time entry or disbursement to bill')
      return
    }
    const response = await fetch('/api/accounttrack/invoices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        matter_id: matterId,
        time_entry_ids: selectedEntryIds,
        disbursement_ids: selectedDisbIds,
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not create invoice')
      return
    }
    await loadAll(matterId)
  }

  const handleRecordPayment = async (invoiceId) => {
    const amount = parseFloat(paymentByInvoice[invoiceId] || '')
    if (!(amount > 0)) return
    const response = await fetch('/api/accounttrack/invoices', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: invoiceId, payment_amount: amount }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not record payment')
      return
    }
    setPaymentByInvoice((prev) => ({ ...prev, [invoiceId]: '' }))
    await loadAll(matterId)
  }

  const startEditingBudget = () => {
    setBudgetTarget(matterBudget?.target_revenue ?? '')
    setBudgetNotes(matterBudget?.notes ?? '')
    setEditingBudget(true)
  }

  const handleSaveBudget = async () => {
    setSavingBudget(true)
    setError('')

    // Matter budgets, unlike lawyer budgets, aren't naturally period-based —
    // a matter has one overall cost ceiling, not a monthly target. A wide
    // sentinel range gives it one durable budget row per matter within the
    // same schema as lawyer budgets, rather than a separate periodless table.
    const body = matterBudget
      ? { id: matterBudget.id, target_revenue: budgetTarget === '' ? null : Number(budgetTarget), notes: budgetNotes || null }
      : {
          matter_id: matterId,
          period_start: '2000-01-01',
          period_end: '2099-12-31',
          target_revenue: budgetTarget === '' ? null : Number(budgetTarget),
          notes: budgetNotes || null,
        }

    const response = await fetch('/api/accounttrack/budgets', {
      method: matterBudget ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not save matter budget')
      setSavingBudget(false)
      return
    }

    setSavingBudget(false)
    await loadAll(matterId)
  }

  // Actual spend to date = everything already invoiced (fees + disbursements,
  // regardless of payment status) + whatever's still unbilled — the running
  // total of work/cost accumulated against the matter, independent of
  // billing status.
  const invoicedTotal = invoices
    .filter((inv) => inv.status !== 'void')
    .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
  const unbilledFeesTotal = unbilledEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const unbilledDisbTotal = disbursements.reduce((sum, d) => sum + Number(d.amount || 0), 0)
  const matterActualSpend = invoicedTotal + unbilledFeesTotal + unbilledDisbTotal

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">AccountTrack</h1>
        <div className="flex items-center gap-4">
          <Link href="/accounttrack/chart-of-accounts" className="text-sm text-blue-600 hover:underline">
            Chart of Accounts
          </Link>
          <Link href="/accounttrack/statements" className="text-sm text-blue-600 hover:underline">
            Statements
          </Link>
          <Link href="/accounttrack/lawyer-overview" className="text-sm text-blue-600 hover:underline">
            Lawyer Overview
          </Link>
          <Link href="/accounttrack/currencies" className="text-sm text-blue-600 hover:underline">
            Currencies
          </Link>
          <Link href="/accounttrack/registers" className="text-sm text-blue-600 hover:underline">
            Registers →
          </Link>
        </div>
      </div>
      <p className="text-gray-600 mb-6">
        Disbursements, trust/retainer ledger, invoicing, and budgeting per matter, backed by a
        real double-entry General Ledger — every action here posts a balanced journal entry.
      </p>

      <div className="w-80 mb-6">
        <MatterSearchInput
          value={matterQuery}
          onChange={(v) => {
            setMatterQuery(v)
            if (!v) setMatterId('')
          }}
          onSelect={(matter) => {
            setMatterQuery(`${matter.matter_id} · ${matter.case_name}`)
            setMatterId(matter.id)
          }}
          placeholder="Select a matter..."
        />
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {!matterId ? (
        <p className="text-gray-500">Select a matter to manage its accounts.</p>
      ) : loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          <MatterSummaryCard matterId={matterId} />

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-gray-900">Budget</p>
              <button
                type="button"
                onClick={() => (editingBudget ? setEditingBudget(false) : startEditingBudget())}
                className="text-xs text-blue-600 hover:underline"
              >
                {editingBudget ? 'Cancel' : matterBudget ? 'Edit budget' : 'Set budget'}
              </button>
            </div>

            {matterBudget?.target_revenue ? (
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Actual spend to date</span>
                  <span className="text-gray-900">{fmtAmount(matterActualSpend)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Budget ceiling</span>
                  <span className="text-gray-900">{fmtAmount(matterBudget.target_revenue)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className={
                      matterActualSpend > Number(matterBudget.target_revenue)
                        ? 'bg-red-500 h-2 rounded-full'
                        : 'bg-blue-500 h-2 rounded-full'
                    }
                    style={{
                      width: `${Math.min(100, (matterActualSpend / Number(matterBudget.target_revenue)) * 100)}%`,
                    }}
                  />
                </div>
                {matterActualSpend > Number(matterBudget.target_revenue) && (
                  <p className="text-xs text-red-600 mt-1">Over budget</p>
                )}
                {matterBudget.notes && <p className="text-xs text-gray-400 mt-2">{matterBudget.notes}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No budget set for this matter.</p>
            )}

            {editingBudget && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Budget ceiling (₦)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={budgetTarget}
                    onChange={(e) => setBudgetTarget(e.target.value)}
                    className="w-32 px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <input
                    type="text"
                    value={budgetNotes}
                    onChange={(e) => setBudgetNotes(e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveBudget}
                  disabled={savingBudget}
                  className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <p className="font-medium text-gray-900 mb-3">Create invoice from unbilled items</p>

            {unbilledEntries.length === 0 && disbursements.length === 0 ? (
              <p className="text-sm text-gray-500 mb-3">Nothing unbilled for this matter.</p>
            ) : (
              <div className="space-y-1 mb-3">
                {unbilledEntries.map((entry) => (
                  <label key={entry.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedEntryIds.includes(entry.id)}
                      onChange={(e) =>
                        setSelectedEntryIds((prev) =>
                          e.target.checked ? [...prev, entry.id] : prev.filter((id) => id !== entry.id)
                        )
                      }
                    />
                    <span className="text-gray-700">
                      {entry.entry_date} · {entry.explanation || 'Time entry'} · {fmtAmount(entry.amount, entry.currency)}
                    </span>
                  </label>
                ))}
                {disbursements.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedDisbIds.includes(d.id)}
                      onChange={(e) =>
                        setSelectedDisbIds((prev) =>
                          e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                        )
                      }
                    />
                    <span className="text-gray-700">
                      {d.disb_date} · {d.description || 'Disbursement'} · {fmtAmount(d.amount, d.currency)}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateInvoice}
              disabled={selectedEntryIds.length === 0 && selectedDisbIds.length === 0}
              className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Create invoice
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <p className="font-medium text-gray-900 mb-3">Invoices</p>
            {invoices.length === 0 ? (
              <p className="text-sm text-gray-500">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm border-t border-gray-100 pt-2">
                    <span className="text-gray-700">
                      {inv.invoice_number} · {fmtAmount(inv.total_amount, inv.currency)} · paid {fmtAmount(inv.paid_amount, inv.currency)} ·{' '}
                      <span className="capitalize">{inv.status.replace('_', ' ')}</span>
                    </span>
                    {inv.status !== 'paid' && inv.status !== 'void' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Payment"
                          value={paymentByInvoice[inv.id] || ''}
                          onChange={(e) =>
                            setPaymentByInvoice((prev) => ({ ...prev, [inv.id]: e.target.value }))
                          }
                          className="w-24 px-2 py-1 border rounded text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleRecordPayment(inv.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Record payment
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <p className="font-medium text-gray-900 mb-3">Add disbursement</p>
            <form onSubmit={handleAddDisbursement} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input
                  type="date"
                  value={disbDate}
                  onChange={(e) => setDisbDate(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input
                  type="text"
                  value={disbDescription}
                  onChange={(e) => setDisbDescription(e.target.value)}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  value={disbAmount}
                  onChange={(e) => setDisbAmount(e.target.value)}
                  className="w-28 px-2 py-1 border rounded text-sm"
                />
              </div>
              <button type="submit" className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50">
                Add
              </button>
            </form>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="font-medium text-gray-900 mb-3">Trust / Retainer ledger</p>
            <form onSubmit={handleAddLedgerEntry} className="flex flex-wrap items-end gap-2 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={ledgerType}
                  onChange={(e) => setLedgerType(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="trust">Trust</option>
                  <option value="retainer">Retainer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount (+in / -out)</label>
                <input
                  type="number"
                  step="0.01"
                  value={ledgerAmount}
                  onChange={(e) => setLedgerAmount(e.target.value)}
                  className="w-32 px-2 py-1 border rounded text-sm"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input
                  type="text"
                  value={ledgerDescription}
                  onChange={(e) => setLedgerDescription(e.target.value)}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <button type="submit" className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50">
                Add entry
              </button>
            </form>

            {ledgerEntries.length === 0 ? (
              <p className="text-sm text-gray-500">No ledger entries yet.</p>
            ) : (
              <div className="space-y-1">
                {ledgerEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-sm border-t border-gray-100 pt-1">
                    <span className="text-gray-700">
                      {entry.entry_date} ·{' '}
                      <span className="capitalize">{entry.ledger_type}</span> ·{' '}
                      {entry.description || '—'}
                    </span>
                    <span className={entry.amount < 0 ? 'text-red-600' : 'text-green-700'}>
                      {fmtAmount(entry.amount, entry.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
