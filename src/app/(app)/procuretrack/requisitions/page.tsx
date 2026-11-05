// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const APPROVER_ROLES = ['owner', 'admin', 'manager']

const statusColor = {
  draft: 'bg-gray-100 text-gray-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  converted_to_rfq: 'bg-blue-100 text-blue-700',
  converted_to_po: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function RequisitionsPage() {
  const [role, setRole] = useState('')
  const [userId, setUserId] = useState('')
  const [requisitions, setRequisitions] = useState([])
  const [departments, setDepartments] = useState([])
  const [catalogItems, setCatalogItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [itemDescription, setItemDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [catalogItemId, setCatalogItemId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isApprover = APPROVER_ROLES.includes(role)

  const load = async () => {
    setLoading(true)
    const [reqRes, deptRes, catalogRes] = await Promise.all([
      fetch('/api/procuretrack/requisitions').then((r) => r.json()),
      fetch('/api/procuretrack/departments').then((r) => r.json()),
      fetch('/api/procuretrack/catalog').then((r) => r.json()),
    ])
    setRequisitions(reqRes.requisitions || [])
    setDepartments(deptRes.departments || [])
    setCatalogItems(catalogRes.items || [])
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
    const res = await fetch('/api/procuretrack/requisitions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        item_description: itemDescription, quantity: Number(quantity),
        estimated_unit_cost: unitCost ? Number(unitCost) : null,
        department_id: departmentId || null, catalog_item_id: catalogItemId || null, reason,
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error)
    } else {
      setItemDescription(''); setQuantity('1'); setUnitCost(''); setDepartmentId(''); setCatalogItemId(''); setReason('')
      await load()
    }
    setSubmitting(false)
  }

  const decide = async (approvalId, status) => {
    const res = await fetch('/api/procuretrack/approvals', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: approvalId, status }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else await load()
  }

  const cancel = async (id) => {
    const res = await fetch('/api/procuretrack/requisitions', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: 'cancelled' }),
    })
    if (res.ok) await load()
  }

  const myPendingSteps = (req) =>
    (req.approvals || []).filter((a) => a.status === 'pending' && a.approver_role === role)

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Requisitions</h1>
      <p className="text-gray-600 mb-6">Raise a purchase requisition. It enters the approval chain automatically.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <h2 className="font-semibold text-gray-900">New requisition</h2>
        <input required placeholder="Item description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-3">
          <input required type="number" min="1" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input type="number" min="0" placeholder="Estimated unit cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">No department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={catalogItemId} onChange={(e) => setCatalogItemId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Not from catalog</option>
            {catalogItems.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" rows={2} />
        <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Submitting...' : 'Submit requisition'}
        </button>
      </form>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {requisitions.map((req) => {
            const pendingForMe = isApprover ? myPendingSteps(req) : []
            return (
              <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{req.item_description} &times; {req.quantity}</p>
                    <p className="text-xs text-gray-500">
                      {req.requester?.email} {req.department?.name ? `· ${req.department.name}` : ''}
                      {req.estimated_total_cost ? ` · ${Number(req.estimated_total_cost).toLocaleString()}` : ''}
                      {req.auto_generated ? ' · auto-generated (low stock)' : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColor[req.status] || 'bg-gray-100 text-gray-600'}`}>{req.status}</span>
                </div>
                {req.reason && <p className="text-sm text-gray-600 mt-2">{req.reason}</p>}
                {pendingForMe.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => decide(pendingForMe[0].id, 'approved')} className="bg-green-600 text-white px-3 py-1 rounded-md text-xs hover:bg-green-700">Approve</button>
                    <button onClick={() => decide(pendingForMe[0].id, 'rejected')} className="bg-red-600 text-white px-3 py-1 rounded-md text-xs hover:bg-red-700">Reject</button>
                  </div>
                )}
                {['pending_approval', 'approved'].includes(req.status) && req.requester?.email && (
                  <button onClick={() => cancel(req.id)} className="mt-2 text-xs text-gray-500 underline">Cancel</button>
                )}
              </div>
            )
          })}
          {requisitions.length === 0 && <p className="text-sm text-gray-500">No requisitions yet.</p>}
        </div>
      )}
    </div>
  )
}
