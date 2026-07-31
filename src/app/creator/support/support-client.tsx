// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const STATUS_LABEL = {
  open: 'Open',
  agent_assigned: 'Agent assigned',
  resolved: 'Issue resolved',
}

const STATUS_BADGE = {
  open: 'bg-amber-100 text-amber-700',
  agent_assigned: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
}

export default function SupportClient() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [selected, setSelected] = useState(null)
  const [thread, setThread] = useState(null)
  const [replyBody, setReplyBody] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/creator/support')
    const result = await res.json()
    if (res.ok) setRequests(result.requests || [])
    else setError(result.error || 'Could not load requests')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openRequest = async (req) => {
    setSelected(req)
    const res = await fetch(`/api/creator/support/${req.id}`)
    const result = await res.json()
    if (res.ok) setThread(result)
  }

  const handleReply = async (e) => {
    e.preventDefault()
    setBusy(true)
    const res = await fetch(`/api/creator/support/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: replyBody }),
    })
    if (res.ok) {
      setReplyBody('')
      await openRequest(selected)
      await load()
    }
    setBusy(false)
  }

  const updateStatus = async (status) => {
    setBusy(true)
    const res = await fetch(`/api/creator/support/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      await openRequest(selected)
      await load()
    }
    setBusy(false)
  }

  const filtered = statusFilter ? requests.filter((r) => r.status === statusFilter) : requests

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Support</h1>
      <p className="text-gray-600 mb-6">Requests from every organization on the platform.</p>

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
              <option value="agent_assigned">Agent assigned</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500 text-sm">No requests.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((req) => (
                <button
                  key={req.id}
                  onClick={() => openRequest(req)}
                  className={`w-full text-left border rounded-lg p-3 hover:bg-gray-50 ${selected?.id === req.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{req.subject}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status]}`}>
                      {STATUS_LABEL[req.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {req.organizations?.name || 'Unknown org'} · Sev {req.severity} ·{' '}
                    {req.channel === 'ai_assisted' ? 'AI Assistant' : 'Standard'} ·{' '}
                    {new Date(req.created_at).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!selected ? (
            <p className="text-gray-500 text-sm">Select a request to view its thread.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="font-medium text-gray-900">{selected.subject}</p>
              <p className="text-xs text-gray-500 mb-3">{selected.organizations?.name}</p>
              <p className="text-sm text-gray-700 mb-4">{selected.description}</p>

              <div className="flex gap-2 mb-4">
                {['open', 'agent_assigned', 'resolved'].map((s) => (
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

              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {(thread?.messages || []).map((m) => (
                  <div key={m.id} className={`text-sm p-2 rounded-md ${m.sender_type === 'agent' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-400 capitalize">{m.sender_type}</p>
                    <p>{m.body}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleReply} className="flex gap-2">
                <input
                  type="text"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
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
