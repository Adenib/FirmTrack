// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const ROLES = ['manager', 'accounts', 'admin', 'owner']

export default function ProcureTrackSettingsPage() {
  const [rules, setRules] = useState([])
  const [departments, setDepartments] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [minAmount, setMinAmount] = useState('0')
  const [maxAmount, setMaxAmount] = useState('')
  const [ruleDepartmentId, setRuleDepartmentId] = useState('')
  const [sequence, setSequence] = useState(['manager'])
  const [submitting, setSubmitting] = useState(false)

  const [inviteVendorId, setInviteVendorId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePassword, setInvitePassword] = useState('')

  const load = async () => {
    setLoading(true)
    const [ruleRes, deptRes, vendorRes] = await Promise.all([
      fetch('/api/procuretrack/approval-rules').then((r) => r.json()),
      fetch('/api/procuretrack/departments').then((r) => r.json()),
      fetch('/api/procuretrack/vendors').then((r) => r.json()),
    ])
    setRules(ruleRes.rules || [])
    setDepartments(deptRes.departments || [])
    setVendors(vendorRes.vendors || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submitRule = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/approval-rules', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        min_amount: Number(minAmount), max_amount: maxAmount ? Number(maxAmount) : null,
        department_id: ruleDepartmentId || null, approver_sequence: sequence.map((role) => ({ role })),
      }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setMinAmount('0'); setMaxAmount(''); setRuleDepartmentId(''); setSequence(['manager']); await load() }
    setSubmitting(false)
  }

  const inviteVendor = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setInfo('')
    const res = await fetch('/api/procuretrack/portal/invite', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vendor_id: inviteVendorId, email: inviteEmail, password: invitePassword }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setInfo(`Portal account created for ${inviteEmail} -- share the password with them directly.`); setInviteVendorId(''); setInviteEmail(''); setInvitePassword('') }
    setSubmitting(false)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ProcureTrack Settings</h1>
      <p className="text-gray-600 mb-6">Approval thresholds and vendor portal accounts.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {info && <p className="text-sm text-green-700 mb-4">{info}</p>}

      <form onSubmit={submitRule} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm">New approval rule</h2>
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min="0" placeholder="Min amount" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input type="number" min="0" placeholder="Max amount (blank = unbounded)" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <select value={ruleDepartmentId} onChange={(e) => setRuleDepartmentId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div>
          <p className="text-xs text-gray-500 mb-1">Approver sequence (in order)</p>
          <div className="flex gap-2">
            {sequence.map((role, i) => (
              <select key={i} value={role} onChange={(e) => setSequence((s) => s.map((r, j) => j === i ? e.target.value : r))} className="border border-gray-300 rounded-md px-2 py-1 text-sm">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            ))}
            <button type="button" onClick={() => setSequence((s) => [...s, 'owner'])} className="text-xs text-blue-600 underline">+ step</button>
            {sequence.length > 1 && <button type="button" onClick={() => setSequence((s) => s.slice(0, -1))} className="text-xs text-gray-500 underline">- step</button>}
          </div>
        </div>
        <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Add rule</button>
      </form>

      <div className="space-y-2 mb-8">
        {(!loading ? rules : []).map((r) => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
            {Number(r.min_amount).toLocaleString()} -- {r.max_amount != null ? Number(r.max_amount).toLocaleString() : 'unbounded'}
            {r.department?.name ? ` (${r.department.name})` : ' (all departments)'}: {r.approver_sequence.map((s) => s.role).join(' -> ')}
          </div>
        ))}
      </div>

      <form onSubmit={inviteVendor} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm">Invite a vendor to the portal</h2>
        <select required value={inviteVendorId} onChange={(e) => setInviteVendorId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">Vendor</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input required type="email" placeholder="Vendor contact email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        <input required type="password" placeholder="Temporary password (share with the vendor)" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Create portal account</button>
      </form>
    </div>
  )
}
