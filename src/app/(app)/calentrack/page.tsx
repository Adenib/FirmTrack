'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MatterSearchInput, { type MatterResult } from '@/components/timetrack/matter-search-input'

type CalendarEvent = {
  id: string
  title: string
  description: string | null
  event_type: string
  start_at: string
  end_at: string
  all_day: boolean
  status: string
  linked_module: string | null
  linked_id: string | null
}

const EVENT_TYPES = ['meeting', 'shift', 'leave', 'deadline', 'other']
const STATUS_OPTIONS = ['scheduled', 'completed', 'cancelled']

const typeColor: Record<string, string> = {
  meeting: 'bg-blue-100 text-blue-700',
  shift: 'bg-purple-100 text-purple-700',
  leave: 'bg-amber-100 text-amber-700',
  deadline: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-600',
}

const statusColor: Record<string, string> = {
  scheduled: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
}

export default function CalenTrackPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState('meeting')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [matterQuery, setMatterQuery] = useState('')
  const [matterId, setMatterId] = useState('')
  const [mattersById, setMattersById] = useState<Record<string, MatterResult>>({})

  const load = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('ft_calendar_events')
      .select('*')
      .order('start_at', { ascending: true })
    setEvents(data || [])
    setLoading(false)

    const linkedMatterIds = [...new Set(
      (data || []).filter((e) => e.linked_module === 'matters' && e.linked_id).map((e) => e.linked_id)
    )]
    if (linkedMatterIds.length > 0) {
      const { data: matters } = await supabase
        .from('matters')
        .select('id, matter_id, case_name, client_id, rate_type, status, clients(name)')
        .in('id', linkedMatterIds)
      setMattersById(Object.fromEntries((matters || []).map((m) => [m.id, m])))
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/calentrack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        event_type: eventType,
        start_at: startAt,
        end_at: endAt || startAt,
        all_day: allDay,
        matter_id: matterId || null,
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not create event')
      setSubmitting(false)
      return
    }

    setTitle('')
    setDescription('')
    setEventType('meeting')
    setStartAt('')
    setEndAt('')
    setAllDay(false)
    setMatterQuery('')
    setMatterId('')
    setSubmitting(false)
    await load()
  }

  const handleStatus = async (id: string, status: string) => {
    await fetch('/api/calentrack', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    await load()
  }

  const filtered = filter === 'all'
    ? events
    : events.filter((e) => e.event_type === filter || e.status === filter)

  const upcoming = events.filter((e) => new Date(e.start_at) >= new Date() && e.status === 'scheduled').length
  const today = events.filter((e) => {
    const d = new Date(e.start_at)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">CalenTrack</h1>
      <p className="text-gray-600 mb-6">Schedule and manage meetings, shifts, leave, and deadlines.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Total events</p>
          <p className="text-xl font-semibold text-gray-900">{events.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Today</p>
          <p className="text-xl font-semibold text-gray-900">{today}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-600">Upcoming</p>
          <p className="text-xl font-semibold text-blue-700">{upcoming}</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            required
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          />
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        <MatterSearchInput
          value={matterQuery}
          onChange={(v) => {
            setMatterQuery(v)
            if (!v) setMatterId('')
          }}
          onSelect={(matter) => {
            setMatterQuery(`${matter.matter_id} · ${matter.case_name}`)
            setMatterId(matter.id)
          }}
          placeholder="Link to matter (optional)"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Start</label>
            <input
              type="datetime-local"
              required
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">End</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day event
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Add event'}
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </form>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all', ...EVENT_TYPES, 'scheduled', 'completed', 'cancelled'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border capitalize ${
              filter === f ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">No events found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((ev) => (
            <div key={ev.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${typeColor[ev.event_type]}`}>
                    {ev.event_type}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[ev.status]}`}>
                    {ev.status}
                  </span>
                </div>
                <p className="font-medium text-gray-900">{ev.title}</p>
                {ev.linked_module === 'matters' && ev.linked_id && mattersById[ev.linked_id] && (
                  <p className="text-xs text-blue-600">
                    {mattersById[ev.linked_id].matter_id} · {mattersById[ev.linked_id].case_name}
                  </p>
                )}
                {ev.description && <p className="text-sm text-gray-500">{ev.description}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {ev.all_day ? 'All day · ' : ''}
                  {new Date(ev.start_at).toLocaleString()}
                  {ev.end_at && ev.end_at !== ev.start_at ? ` → ${new Date(ev.end_at).toLocaleString()}` : ''}
                </p>
              </div>
              <select
                value={ev.status}
                onChange={(e) => handleStatus(ev.id, e.target.value)}
                className="text-xs px-2 py-1 border rounded-md"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}