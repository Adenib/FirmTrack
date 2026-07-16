// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const REVIEW_PRIVILEGED = ['owner', 'admin', 'manager']
const GRIEVANCE_PRIVILEGED = ['owner', 'admin']

const statusColor = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  withdrawn: 'bg-gray-100 text-gray-500',
}

export default function HRTrackRequestsPage() {
  const [tab, setTab] = useState('leave')
  const [me, setMe] = useState(null)
  const [role, setRole] = useState('')
  const [requests, setRequests] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveBalances, setLeaveBalances] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Leave form
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [reliefOfficerId, setReliefOfficerId] = useState('')

  // Redeployment form
  const [currentAssignment, setCurrentAssignment] = useState('')
  const [requestedAssignment, setRequestedAssignment] = useState('')
  const [redeploymentReason, setRedeploymentReason] = useState('')

  // Grievance form
  const [grievanceSubject, setGrievanceSubject] = useState('')
  const [grievanceDescription, setGrievanceDescription] = useState('')

  // Exit form
  const [lastWorkingDay, setLastWorkingDay] = useState('')
  const [exitReason, setExitReason] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [reviewNotes, setReviewNotes] = useState({})
  const [reviewAllowance, setReviewAllowance] = useState({})

  const isPrivileged = REVIEW_PRIVILEGED.includes(role)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/hrtrack/requests')
    const result = await res.json()
    if (res.ok) {
      setRequests(result.requests || [])
      setLeaveTypes(result.leaveTypes || [])
      setLeaveBalances(result.leaveBalances || [])
    } else {
      setError(result.error || 'Could not load requests')
    }
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const [layoutRes, usersRes] = await Promise.all([
        fetch('/api/layout-data').then((r) => r.json()),
        fetch('/api/admin/clients/detail?type=users').then((r) => r.json()),
      ])
      setRole(layoutRes.profile?.role || '')
      setMe(layoutRes.profile)
      setUsers(usersRes.users || [])
      await load()
    }
    init()
  }, [])

  const emailFor = (userId) => users.find((u) => u.id === userId)?.email || null

  const submitRequest = async (type, details) => {
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/hrtrack/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, details }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not submit request')
      setSubmitting(false)
      return false
    }
    setSubmitting(false)
    await load()
    return true
  }

  const handleLeaveSubmit = async (e) => {
    e.preventDefault()
    const ok = await submitRequest('leave', { leave_type_id: leaveTypeId, start_date: leaveStart, end_date: leaveEnd, reason: leaveReason, relief_officer_id: reliefOfficerId || null })
    if (ok) { setLeaveTypeId(''); setLeaveStart(''); setLeaveEnd(''); setLeaveReason(''); setReliefOfficerId('') }
  }
  const handleRedeploymentSubmit = async (e) => {
    e.preventDefault()
    const ok = await submitRequest('redeployment', { current_assignment: currentAssignment, requested_assignment: requestedAssignment, reason: redeploymentReason })
    if (ok) { setCurrentAssignment(''); setRequestedAssignment(''); setRedeploymentReason('') }
  }
  const handleGrievanceSubmit = async (e) => {
    e.preventDefault()
    const ok = await submitRequest('grievance', { subject: grievanceSubject, description: grievanceDescription })
    if (ok) { setGrievanceSubject(''); setGrievanceDescription('') }
  }
  const handleExitSubmit = async (e) => {
    e.preventDefault()
    const ok = await submitRequest('exit', { last_working_day: lastWorkingDay, reason: exitReason })
    if (ok) { setLastWorkingDay(''); setExitReason('') }
  }

  const handleReview = async (id, status, leaveAllowanceAmount) => {
    setError('')
    const res = await fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status, reviewer_notes: reviewNotes[id] || '', leave_allowance_amount: leaveAllowanceAmount ?? null }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not update request')
    await load()
  }

  const handleWithdraw = async (id) => {
    await fetch('/api/hrtrack/requests', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: 'withdrawn' }),
    })
    await load()
  }

  const myRequestsOfType = (type) => requests.filter((r) => r.type === type && r.requester?.email === me?.email)
  const pendingOfType = (type) => requests.filter((r) => r.type === type && r.status === 'pending')

  const TABS = [
    { key: 'leave', label: 'Leave' },
    { key: 'redeployment', label: 'Redeployment' },
    { key: 'grievance', label: 'Grievance' },
    { key: 'exit', label: 'Exit' },
    ...(isPrivileged ? [{ key: 'review', label: `Review${requests.filter((r) => r.status === 'pending').length ? ` (${requests.filter((r) => r.status === 'pending').length})` : ''}` }] : []),
  ]

  const renderMyList = (type) => {
    const mine = myRequestsOfType(type)
    if (mine.length === 0) return <p className="text-gray-500 text-sm">No {type} requests yet.</p>
    return (
      <div className="space-y-2">
        {mine.map((r) => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-gray-900">
                {r.type === 'leave' && `${r.details.start_date} → ${r.details.end_date} (${r.details.days} days)`}
                {r.type === 'redeployment' && r.details.requested_assignment}
                {r.type === 'grievance' && r.details.subject}
                {r.type === 'exit' && `Last day: ${r.details.last_working_day}`}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[r.status]}`}>{r.status}</span>
            </div>
            {(r.details.reason || r.details.description) && (
              <p className="text-sm text-gray-600">{r.details.reason || r.details.description}</p>
            )}
            {r.type === 'leave' && r.details.relief_officer_id && (
              <p className="text-xs text-gray-500 mt-1">Relief officer: {emailFor(r.details.relief_officer_id) || 'Unknown'}</p>
            )}
            {r.type === 'leave' && r.leave_allowance_amount != null && (
              <p className="text-xs text-gray-500 mt-1">Leave allowance: ₦{Number(r.leave_allowance_amount).toLocaleString()}</p>
            )}
            {r.reviewer_notes && <p className="text-xs text-gray-500 mt-1">Reviewer notes: {r.reviewer_notes}</p>}
            {r.status === 'pending' && (
              <button type="button" onClick={() => handleWithdraw(r.id)} className="text-xs text-red-500 hover:underline mt-2">Withdraw</button>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Requests</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-4">Leave, redeployment, grievances, and exit requests.</p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {tab === 'leave' && (
            <div>
              {leaveBalances.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {leaveBalances.map((b) => (
                    <div key={b.leave_type_id} className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{b.name}</p>
                      <p className="text-lg font-semibold text-gray-900">{b.unlimited ? 'Unlimited' : `${b.remaining} of ${b.annual_days} days`}</p>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleLeaveSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
                <select required value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Leave type...</option>
                  {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" required value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
                  <input type="date" required value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
                </div>
                <select value={reliefOfficerId} onChange={(e) => setReliefOfficerId(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Relief officer (optional)...</option>
                  {users.filter((u) => u.email !== me?.email).map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
                <textarea placeholder="Reason (optional)" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
                <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Request leave'}
                </button>
              </form>
              {renderMyList('leave')}
            </div>
          )}

          {tab === 'redeployment' && (
            <div>
              <form onSubmit={handleRedeploymentSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
                <input type="text" placeholder="Current assignment (optional)" value={currentAssignment} onChange={(e) => setCurrentAssignment(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                <input type="text" required placeholder="Requested assignment" value={requestedAssignment} onChange={(e) => setRequestedAssignment(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                <textarea placeholder="Reason" value={redeploymentReason} onChange={(e) => setRedeploymentReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
                <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Request redeployment'}
                </button>
              </form>
              {renderMyList('redeployment')}
            </div>
          )}

          {tab === 'grievance' && (
            <div>
              <p className="text-xs text-gray-500 mb-3">Grievances are only visible to you and owner/admin.</p>
              <form onSubmit={handleGrievanceSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
                <input type="text" required placeholder="Subject" value={grievanceSubject} onChange={(e) => setGrievanceSubject(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                <textarea required placeholder="Description" value={grievanceDescription} onChange={(e) => setGrievanceDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md text-sm" />
                <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Raise grievance'}
                </button>
              </form>
              {renderMyList('grievance')}
            </div>
          )}

          {tab === 'exit' && (
            <div>
              <form onSubmit={handleExitSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
                <input type="date" required value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                <textarea placeholder="Reason (optional)" value={exitReason} onChange={(e) => setExitReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
                <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Submit exit request'}
                </button>
              </form>
              {renderMyList('exit')}
            </div>
          )}

          {tab === 'review' && isPrivileged && (
            <div className="space-y-6">
              {['leave', 'redeployment', 'grievance', 'exit'].map((type) => {
                const pending = pendingOfType(type)
                if (type === 'grievance' && !GRIEVANCE_PRIVILEGED.includes(role)) return null
                if (pending.length === 0) return null
                return (
                  <div key={type}>
                    <p className="font-medium text-gray-900 mb-2 capitalize">{type} — pending</p>
                    <div className="space-y-2">
                      {pending.map((r) => (
                        <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4">
                          <p className="text-sm text-gray-900 font-medium">{r.requester?.email}</p>
                          <p className="text-sm text-gray-700">
                            {r.type === 'leave' && `${r.details.start_date} → ${r.details.end_date} (${r.details.days} days)`}
                            {r.type === 'redeployment' && r.details.requested_assignment}
                            {r.type === 'grievance' && r.details.subject}
                            {r.type === 'exit' && `Last day: ${r.details.last_working_day}`}
                          </p>
                          {(r.details.reason || r.details.description) && (
                            <p className="text-xs text-gray-500 mt-1">{r.details.reason || r.details.description}</p>
                          )}
                          {type === 'leave' && r.details.relief_officer_id && (
                            <p className="text-xs text-gray-500 mt-1">Relief officer: {emailFor(r.details.relief_officer_id) || 'Unknown'}</p>
                          )}
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={reviewNotes[r.id] || ''}
                            onChange={(e) => setReviewNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="w-full px-2 py-1 border rounded text-xs mt-2 mb-2"
                          />
                          {type === 'leave' && (
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Leave allowance amount (optional, ₦)"
                              value={reviewAllowance[r.id] || ''}
                              onChange={(e) => setReviewAllowance((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              className="w-full px-2 py-1 border rounded text-xs mb-2"
                            />
                          )}
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => handleReview(r.id, 'approved', type === 'leave' ? reviewAllowance[r.id] : null)} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700">Approve</button>
                            <button type="button" onClick={() => handleReview(r.id, 'rejected')} className="text-xs border px-3 py-1.5 rounded-md hover:bg-gray-50">Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {requests.filter((r) => r.status === 'pending').length === 0 && <p className="text-gray-500 text-sm">Nothing pending review.</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
