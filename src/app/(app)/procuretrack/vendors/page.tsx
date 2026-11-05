// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const APPROVER_ROLES = ['owner', 'admin', 'manager']

const statusColor = {
  active: 'bg-green-100 text-green-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  blacklisted: 'bg-red-100 text-red-600',
}

export default function VendorsPage() {
  const [role, setRole] = useState('')
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isApprover = APPROVER_ROLES.includes(role)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/procuretrack/vendors').then((r) => r.json())
    setVendors(res.vendors || [])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const layoutRes = await fetch('/api/layout-data').then((r) => r.json())
      setRole(layoutRes.profile?.role || '')
      await load()
    }
    init()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/vendors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email: email || null, category: category || null, status: 'active' }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setName(''); setEmail(''); setCategory(''); await load() }
    setSubmitting(false)
  }

  const setStatus = async (id, status) => {
    const res = await fetch('/api/procuretrack/vendors', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }),
    })
    if (res.ok) await load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Vendors</h1>
      <p className="text-gray-600 mb-6">Shared vendor registry, also used by AssetTrack for repair referrals.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {isApprover && (
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 flex flex-wrap gap-3 items-end">
          <input required placeholder="Vendor name" value={name} onChange={(e) => setName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Add vendor</button>
        </form>
      )}

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {vendors.map((v) => (
            <div key={v.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900">{v.name}</p>
                <p className="text-xs text-gray-500">{v.category || 'No category'} {v.email ? `· ${v.email}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor[v.status] || 'bg-gray-100 text-gray-600'}`}>{v.status}</span>
                {isApprover && (
                  <select value={v.status} onChange={(e) => setStatus(v.id, e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-xs">
                    <option value="active">active</option>
                    <option value="pending_approval">pending_approval</option>
                    <option value="blacklisted">blacklisted</option>
                  </select>
                )}
              </div>
            </div>
          ))}
          {vendors.length === 0 && <p className="text-sm text-gray-500">No vendors yet.</p>}
        </div>
      )}
    </div>
  )
}
