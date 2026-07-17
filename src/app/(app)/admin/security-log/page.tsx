'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const EVENT_TYPES = [
  'login_success',
  'login_failure',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'user_created',
  'user_role_changed',
  'user_deactivated',
  'user_reactivated',
  'session_revoked',
]

const eventColor: Record<string, string> = {
  login_success: 'bg-green-100 text-green-700',
  login_failure: 'bg-red-100 text-red-600',
  logout: 'bg-gray-100 text-gray-600',
  password_reset_requested: 'bg-amber-100 text-amber-700',
  password_reset_completed: 'bg-amber-100 text-amber-700',
  user_created: 'bg-blue-100 text-blue-700',
  user_role_changed: 'bg-blue-100 text-blue-700',
  session_revoked: 'bg-red-100 text-red-600',
  user_deactivated: 'bg-red-100 text-red-600',
  user_reactivated: 'bg-green-100 text-green-700',
}

type AuditEvent = {
  id: string
  event_type: string
  email: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export default function SecurityLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  const load = async (eventType: string) => {
    setLoading(true)
    setError('')
    const url = eventType ? `/api/admin/security-log?event_type=${eventType}` : '/api/admin/security-log'
    const response = await fetch(url)
    const result = await response.json()
    if (!response.ok) setError(result.error || 'Could not load security log')
    else setEvents(result.events || [])
    setLoading(false)
  }

  useEffect(() => {
    load(filter)
  }, [filter])

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Security Log</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
      </div>
      <p className="text-gray-600 mb-6">
        Login attempts, logouts, password resets, and user management actions for your organization. Most recent 200 events.
      </p>

      <div className="mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="">All event types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Time</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Event</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">IP</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">User Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${eventColor[e.event_type] || 'bg-gray-100 text-gray-600'}`}>
                      {e.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{e.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{e.ip_address || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-xs">{e.user_agent || '—'}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-3 text-gray-500">No events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
