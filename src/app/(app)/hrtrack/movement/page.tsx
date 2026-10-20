'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Movement = {
  id: string
  location_from: string | null
  location_to: string
  purpose: string | null
  status: string
  moved_at: string
  users: { email: string } | null
}

const STATUS_OPTIONS = ['pending', 'approved', 'rejected']
const REVIEW_PRIVILEGED = ['owner', 'admin', 'manager', 'hr']

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

export default function HRTrackMovementPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [purpose, setPurpose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)

  const isPrivileged = REVIEW_PRIVILEGED.includes(role)

  const load = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('movements')
      .select('*, users(email)')
      .order('moved_at', { ascending: false })
    setMovements(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    fetch('/api/layout-data')
      .then((r) => r.json())
      .then((result) => setRole(result.profile?.role || ''))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/movementtrack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location_from: from, location_to: to, purpose }),
    })

    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not log movement')
      setSubmitting(false)
      return
    }

    setFrom('')
    setTo('')
    setPurpose('')
    setSubmitting(false)
    await load()
  }

  const handleStatus = async (id: string, status: string) => {
    await fetch('/api/movementtrack', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    await load()
  }

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pendingMovements = movements.filter((m) => m.status === 'pending')
  const allPendingSelected = pendingMovements.length > 0 && pendingMovements.every((m) => selected.has(m.id))

  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pendingMovements.map((m) => m.id)))
    }
  }

  const handleBulkStatus = async (status: string) => {
    if (selected.size === 0) return
    setBulkActing(true)
    await fetch('/api/movementtrack', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected), status }),
    })
    setSelected(new Set())
    setBulkActing(false)
    await load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Movement</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Log and manage staff movements and location changes.</p>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="From (optional)"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          />
          <input
            type="text"
            required
            placeholder="To (destination)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <input
          type="text"
          placeholder="Purpose (optional)"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Logging...' : 'Log movement'}
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </form>

      {isPrivileged && pendingMovements.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mb-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allPendingSelected} onChange={toggleSelectAllPending} />
            Select all pending ({pendingMovements.length})
          </label>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => handleBulkStatus('approved')}
                disabled={bulkActing}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Approve selected
              </button>
              <button
                type="button"
                onClick={() => handleBulkStatus('rejected')}
                disabled={bulkActing}
                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Reject selected
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : movements.length === 0 ? (
        <p className="text-gray-500">No movements logged yet.</p>
      ) : (
        <div className="space-y-2">
          {movements.map((m) => (
            <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                {isPrivileged && m.status === 'pending' && (
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggleSelected(m.id)}
                  />
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {m.location_from ? `${m.location_from} → ` : ''}{m.location_to}
                  </p>
                  {m.purpose && <p className="text-sm text-gray-500">{m.purpose}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {m.users?.email || 'Unknown staff'} · {new Date(m.moved_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[m.status]}`}>
                  {m.status}
                </span>
                {isPrivileged && (
                  <select
                    value={m.status}
                    onChange={(e) => handleStatus(m.id, e.target.value)}
                    className="text-xs px-2 py-1 border rounded-md"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
