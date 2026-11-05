// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

function expiryBadge(endDate) {
  if (!endDate) return null
  const days = Math.round((new Date(endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-600">Expired</span>
  if (days <= 30) return <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">Expires in {days}d</span>
  return <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Active</span>
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [contractsRes, vendorsRes] = await Promise.all([
      fetch('/api/procuretrack/contracts').then((r) => r.json()),
      fetch('/api/procuretrack/vendors').then((r) => r.json()),
    ])
    setContracts(contractsRes.contracts || [])
    setVendors(vendorsRes.vendors || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/contracts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, vendor_id: vendorId, start_date: startDate || null, end_date: endDate || null }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setTitle(''); setVendorId(''); setStartDate(''); setEndDate(''); await load() }
    setSubmitting(false)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Contracts</h1>
      <p className="text-gray-600 mb-6">Framework agreements with vendors. Owner/admin/manager get an email alert at 30/7/1 days before expiry.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <select required value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Vendor</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Add contract</button>
      </form>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {contracts.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900">{c.title} -- {c.vendor?.name}</p>
                <p className="text-xs text-gray-500">{c.start_date || '?'} to {c.end_date || '?'}</p>
              </div>
              {expiryBadge(c.end_date)}
            </div>
          ))}
          {contracts.length === 0 && <p className="text-sm text-gray-500">No contracts yet.</p>}
        </div>
      )}
    </div>
  )
}
