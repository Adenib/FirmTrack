// @ts-nocheck
'use client'

import { useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 3000
const TYPING_PING_THROTTLE_MS = 2000

const STATUS_LABEL = {
  open: 'Open',
  contacted: 'Contacted',
  closed: 'Closed',
}

const STATUS_BADGE = {
  open: 'bg-amber-100 text-amber-700',
  contacted: 'bg-blue-100 text-blue-700',
  closed: 'bg-green-100 text-green-700',
}

export default function SalesClient() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [selected, setSelected] = useState(null)
  const [thread, setThread] = useState(null)
  const [replyBody, setReplyBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [leadTyping, setLeadTyping] = useState(false)
  const lastTypingPingRef = useRef(0)
  const [admins, setAdmins] = useState([])
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [reassignMessage, setReassignMessage] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/creator/sales-leads')
    const result = await res.json()
    if (res.ok) setLeads(result.leads || [])
    else setError(result.error || 'Could not load leads')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Only staff who can actually act on a lead (same 'sales' page access
    // this route itself requires) are worth offering as a reassignment
    // target.
    fetch('/api/creator/staff')
      .then((r) => r.json())
      .then((result) => {
        const eligible = (result.staff || []).filter(
          (s) => s.status === 'active' && ['creator', 'admin', 'sales'].includes(s.role)
        )
        setAdmins(eligible)
      })
      .catch(() => {})
  }, [])

  const openLead = async (lead) => {
    setSelected(lead)
    const res = await fetch(`/api/creator/sales-leads/${lead.id}`)
    const result = await res.json()
    if (res.ok) {
      setThread(result)
      setLeadTyping(!!result.leadTyping)
    }
  }

  // Throttled -- fires at most once per TYPING_PING_THROTTLE_MS, not on
  // every keystroke.
  const pingTyping = (leadId) => {
    const now = Date.now()
    if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return
    lastTypingPingRef.current = now
    fetch(`/api/creator/sales-leads/${leadId}/typing`, { method: 'POST' }).catch(() => {})
  }

  const handleReplyChange = (value) => {
    setReplyBody(value)
    if (value && selected) pingTyping(selected.id)
  }

  // Polls the open thread for new lead/agent messages and the lead's
  // typing status, without requiring the agent to do anything.
  useEffect(() => {
    if (!selected) return
    const poll = async () => {
      const res = await fetch(`/api/creator/sales-leads/${selected.id}`)
      const result = await res.json()
      if (res.ok) {
        setThread(result)
        setLeadTyping(!!result.leadTyping)
      }
    }
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [selected])

  const handleReply = async (e) => {
    e.preventDefault()
    setBusy(true)
    const res = await fetch(`/api/creator/sales-leads/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: replyBody }),
    })
    if (res.ok) {
      setReplyBody('')
      await openLead(selected)
      await load()
    }
    setBusy(false)
  }

  const updateStatus = async (status) => {
    setBusy(true)
    const res = await fetch(`/api/creator/sales-leads/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      await openLead(selected)
      await load()
    }
    setBusy(false)
  }

  const reassign = async () => {
    if (!reassignTarget) return
    setReassigning(true)
    setReassignMessage('')
    const res = await fetch(`/api/creator/sales-leads/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigned_to: reassignTarget }),
    })
    const result = await res.json()
    if (res.ok) {
      setReassignMessage('Reassigned -- they have been notified by email.')
      await openLead(selected)
      await load()
    } else {
      setReassignMessage(result.error || 'Could not reassign')
    }
    setReassigning(false)
  }

  const filtered = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Sales Chat</h1>
      <p className="text-gray-600 mb-6">Leads from "Chat with Sales" on the public site.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="contacted">Contacted</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500 text-sm">No leads.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => openLead(lead)}
                  className={`w-full text-left border rounded-lg p-3 hover:bg-gray-50 ${selected?.id === lead.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[lead.status]}`}>
                      {STATUS_LABEL[lead.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {lead.email} · {new Date(lead.created_at).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!selected ? (
            <p className="text-gray-500 text-sm">Select a lead to view its thread.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="font-medium text-gray-900">{selected.name}</p>
              <p className="text-xs text-gray-500 mb-3">
                {selected.email}{selected.phone ? ` · ${selected.phone}` : ''}
              </p>

              <div className="flex gap-2 mb-4">
                {['open', 'contacted', 'closed'].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(s)}
                    disabled={busy || selected.status === s}
                    className="text-xs px-2 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-40"
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>

              {admins.length > 0 && (
                <div className="mb-4">
                  {(() => {
                    const currentAssigneeId = thread?.lead?.assigned_to ?? selected.assigned_to
                    const currentAssignee = admins.find((a) => a.id === currentAssigneeId)
                    return currentAssignee ? (
                      <p className="text-xs text-gray-500 mb-1">
                        Currently assigned to: <span className="font-medium">{currentAssignee.nickname || currentAssignee.full_name || currentAssignee.email}</span>
                      </p>
                    ) : null
                  })()}
                  <span className="text-xs text-gray-500 block mb-1">Reassign to:</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={reassignTarget}
                      onChange={(e) => setReassignTarget(e.target.value)}
                      className="flex-1 px-2 py-1.5 border rounded-md text-sm"
                    >
                      <option value="">Pick a colleague...</option>
                      {admins
                        .filter((a) => a.id !== (thread?.lead?.assigned_to ?? selected.assigned_to))
                        .map((a) => (
                          <option key={a.id} value={a.id}>{a.nickname || a.full_name || a.email}</option>
                        ))}
                    </select>
                    <button
                      onClick={reassign}
                      disabled={reassigning || !reassignTarget}
                      className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap"
                    >
                      {reassigning ? 'Reassigning...' : 'Reassign'}
                    </button>
                  </div>
                  {reassignMessage && <p className="text-xs text-gray-500 mt-1">{reassignMessage}</p>}
                </div>
              )}

              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {(thread?.messages || []).map((m) => (
                  <div key={m.id} className={`text-sm p-2 rounded-md ${m.sender_type === 'agent' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-400 capitalize">{m.sender_type === 'lead' ? 'Prospect' : 'Sales'}</p>
                    <p>{m.body}</p>
                  </div>
                ))}
              </div>

              {leadTyping && <p className="text-xs text-gray-400 italic mb-1">Prospect is typing...</p>}
              <form onSubmit={handleReply} className="flex gap-2">
                <input
                  type="text"
                  value={replyBody}
                  onChange={(e) => handleReplyChange(e.target.value)}
                  placeholder="Reply..."
                  className="flex-1 px-3 py-2 border rounded-md text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !replyBody.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Reply
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
