'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function pad(n: number) { return String(n).padStart(2, '0') }
function iso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function presets() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return [
    { label: 'This Month', from: iso(startOfMonth), to: iso(endOfMonth) },
  ]
}

export default function CalenTrackReportsPage() {
  const now = new Date()
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(() => iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  const [events, setEvents] = useState<{ event_type: string; status: string; start_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (fromDate: string, toDate: string) => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('ft_calendar_events')
      .select('event_type, status, start_at')
      .gte('start_at', fromDate)
      .lte('start_at', toDate + 'T23:59:59')
    setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => { load(from, to) }, [])

  const byType: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const e of events) {
    byType[e.event_type] = (byType[e.event_type] || 0) + 1
    byStatus[e.status] = (byStatus[e.status] || 0) + 1
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">CalenTrack Reports</h1>
        <Link href="/calentrack" className="text-sm text-blue-600 hover:underline">← CalenTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Event counts by type and status over the selected period.</p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        {presets().map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => { setFrom(p.from); setTo(p.to); load(p.from, p.to) }}
            className="text-xs px-3 py-1.5 border rounded-md hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <button type="button" onClick={() => load(from, to)} className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50">Run</button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events for this period.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="font-medium text-gray-900 mb-2">By Type</p>
            {Object.entries(byType).map(([type, count]) => (
              <div key={type} className="flex justify-between text-sm py-1">
                <span className="capitalize text-gray-700">{type}</span>
                <span className="text-gray-900">{count}</span>
              </div>
            ))}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="font-medium text-gray-900 mb-2">By Status</p>
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between text-sm py-1">
                <span className="capitalize text-gray-700">{status}</span>
                <span className="text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
