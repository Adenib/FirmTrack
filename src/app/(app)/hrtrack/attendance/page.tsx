// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function fmtTime(t) {
  return t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
}
function fmtDate(t) {
  return t ? new Date(t).toLocaleDateString() : '—'
}
function fmtHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return '—'
  const hrs = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / (1000 * 60 * 60)
  return hrs.toFixed(2) + 'h'
}

const statusColor = {
  office: 'bg-blue-100 text-blue-700',
  remote: 'bg-amber-100 text-amber-700',
}

const WFH_PRIVILEGED = ['owner', 'admin', 'hr']

export default function AttendancePage() {
  const [me, setMe] = useState({ email: '', role: '' })
  const [wfhChecks, setWfhChecks] = useState([])
  const [wfhChecksLoading, setWfhChecksLoading] = useState(false)
  const [openRecord, setOpenRecord] = useState(null)
  const [clockedInAt, setClockedInAt] = useState(null)
  const [remoteNote, setRemoteNote] = useState('')
  const [locating, setLocating] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(null)
  const [locationLabel, setLocationLabel] = useState('')
  const [actionError, setActionError] = useState('')

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')

  const [offices, setOffices] = useState([])
  const [showOfficeForm, setShowOfficeForm] = useState(false)
  const [officeName, setOfficeName] = useState('')
  const [officeRadius, setOfficeRadius] = useState(200)

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateFilter) { params.set('from', dateFilter); params.set('to', dateFilter) }
    if (userFilter) params.set('user_id', userFilter)
    const res = await fetch(`/api/hrtrack/attendance?${params.toString()}`)
    const result = await res.json()
    if (res.ok) {
      setRecords(result.records || [])
      const mine = (result.records || []).find((r) => !r.clock_out_at)
      setOpenRecord(mine || null)
    }
    setLoading(false)
  }

  const loadOffices = async () => {
    const res = await fetch('/api/hrtrack/office-locations')
    const result = await res.json()
    if (res.ok) setOffices(result.offices || [])
  }

  const loadWfhChecks = async () => {
    setWfhChecksLoading(true)
    const res = await fetch('/api/hrtrack/wfh-checks')
    const result = await res.json()
    if (res.ok) setWfhChecks(result.checks || [])
    setWfhChecksLoading(false)
  }

  useEffect(() => {
    fetch('/api/layout-data').then((r) => r.json()).then((d) => {
      const role = d.profile?.role || ''
      setMe({ email: d.profile?.email || '', role })
      if (WFH_PRIVILEGED.includes(role)) loadWfhChecks()
    })
    load()
    loadOffices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, userFilter])

  const getLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation is not supported by this browser')); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(new Error(err.message || 'Could not get your location')),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })

  const handleClockIn = async () => {
    setActionError('')
    setLocating(true)
    try {
      const { lat, lng } = await getLocation()
      const geoRes = await fetch('/api/hrtrack/geocode', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat, lng }),
      })
      const geo = await geoRes.json()

      const res = await fetch('/api/hrtrack/attendance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat, lng, location: geo.address, note: remoteNote || undefined }),
      })
      const result = await res.json()
      if (!res.ok) {
        if (res.status === 400 && result.error?.includes('remote')) {
          setPendingStatus('remote')
          setLocationLabel(geo.address)
          setActionError(result.error)
        } else {
          setActionError(result.error || 'Could not clock in')
        }
        setLocating(false)
        return
      }
      setRemoteNote('')
      setPendingStatus(null)
      await load()
    } catch (err) {
      setActionError(err.message)
    }
    setLocating(false)
  }

  const handleClockOut = async () => {
    setActionError('')
    setLocating(true)
    try {
      const { lat, lng } = await getLocation()
      const geoRes = await fetch('/api/hrtrack/geocode', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat, lng }),
      })
      const geo = await geoRes.json()
      const res = await fetch('/api/hrtrack/attendance', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat, lng, location: geo.address }),
      })
      const result = await res.json()
      if (!res.ok) { setActionError(result.error || 'Could not clock out'); setLocating(false); return }
      await load()
    } catch (err) {
      setActionError(err.message)
    }
    setLocating(false)
  }

  const handleAddOffice = async (e) => {
    e.preventDefault()
    setActionError('')
    try {
      const { lat, lng } = await getLocation()
      const res = await fetch('/api/hrtrack/office-locations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: officeName, latitude: lat, longitude: lng, radius_meters: Number(officeRadius) }),
      })
      const result = await res.json()
      if (!res.ok) { setActionError(result.error || 'Could not add office'); return }
      setOfficeName('')
      setShowOfficeForm(false)
      await loadOffices()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const removeOffice = async (id) => {
    await fetch(`/api/hrtrack/office-locations?id=${id}`, { method: 'DELETE' })
    await loadOffices()
  }

  const exportCsv = () => {
    const header = ['Staff', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Location', 'Status', 'Note']
    const rows = records.map((r) => [
      r.users?.email || '', fmtDate(r.clock_in_at), fmtTime(r.clock_in_at), fmtTime(r.clock_out_at),
      fmtHours(r.clock_in_at, r.clock_out_at), r.clock_in_location || '', r.status, r.note || '',
    ])
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const staffOptions = [...new Map(records.map((r) => [r.user_id, r.users?.email])).entries()]

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <p className="font-semibold text-gray-900 mb-3">My Attendance</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Clock In</p>
            <p className="text-lg text-gray-900">{fmtTime(openRecord?.clock_in_at)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Clock Out</p>
            <p className="text-lg text-gray-900">—</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Hours</p>
            <p className="text-lg text-gray-900">—</p>
          </div>
        </div>

        {pendingStatus === 'remote' && (
          <>
            <p className="text-sm text-amber-600 mb-2">📍 Remote — please provide a note</p>
            <input
              type="text"
              placeholder="Remote reason / note (required)"
              value={remoteNote}
              onChange={(e) => setRemoteNote(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm mb-3"
            />
          </>
        )}

        {actionError && <p className="text-red-600 text-sm mb-3">{actionError}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClockIn}
            disabled={locating || !!openRecord}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-md font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {locating ? 'Locating...' : 'Clock In'}
          </button>
          <button
            type="button"
            onClick={handleClockOut}
            disabled={locating || !openRecord}
            className="flex-1 bg-gray-700 text-white py-2.5 rounded-md font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {locating ? 'Locating...' : 'Clock Out'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-900">Office Locations</p>
          <button type="button" onClick={() => setShowOfficeForm(!showOfficeForm)} className="text-xs text-blue-600 hover:underline">
            {showOfficeForm ? 'Cancel' : '+ Add current location as office'}
          </button>
        </div>
        {offices.length === 0 && !showOfficeForm && (
          <p className="text-xs text-gray-400">No office locations configured — all clock-ins are treated as remote.</p>
        )}
        <div className="space-y-1">
          {offices.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{o.name} · {o.radius_meters}m radius</span>
              <button type="button" onClick={() => removeOffice(o.id)} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          ))}
        </div>
        {showOfficeForm && (
          <form onSubmit={handleAddOffice} className="flex items-end gap-2 mt-3 pt-3 border-t border-gray-100">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Office name</label>
              <input type="text" required value={officeName} onChange={(e) => setOfficeName(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Radius (m)</label>
              <input type="number" value={officeRadius} onChange={(e) => setOfficeRadius(e.target.value)} className="w-24 px-2 py-1.5 border rounded text-sm" />
            </div>
            <button type="submit" className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800">Save (uses your current GPS position)</button>
          </form>
        )}
      </div>

      {WFH_PRIVILEGED.includes(me.role) && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-gray-900">WFH Check-ins — Today</p>
            <button type="button" onClick={loadWfhChecks} className="text-xs text-blue-600 hover:underline">Refresh</button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Employees who were prompted &quot;Are you still working from home?&quot; after 30 idle minutes and haven&apos;t
            confirmed yet. Also sent as an end-of-day digest.
          </p>
          {wfhChecksLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : wfhChecks.length === 0 ? (
            <p className="text-sm text-gray-400">No unconfirmed WFH check-ins today.</p>
          ) : (
            <div className="space-y-1">
              {wfhChecks.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm border-t border-gray-100 pt-1">
                  <span className="text-gray-700">{c.users?.email || 'Unknown'}</span>
                  <span className="text-amber-600">Prompted {fmtTime(c.prompted_at)} · no response</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">Attendance Log</p>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="px-2 py-1 border rounded text-sm" />
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="px-2 py-1 border rounded text-sm">
              <option value="">All Staff</option>
              {staffOptions.map(([id, email]) => <option key={id} value={id}>{email}</option>)}
            </select>
            <button type="button" onClick={exportCsv} className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-md hover:bg-green-800">↓ Export CSV</button>
          </div>
        </div>

        {loading ? (
          <p className="p-4 text-gray-500 text-sm">Loading...</p>
        ) : records.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">No attendance records yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Staff</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Date</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Clock In</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Clock Out</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Hours</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Location</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-gray-900">{r.users?.email}</td>
                  <td className="px-4 py-2 text-gray-700">{fmtDate(r.clock_in_at)}</td>
                  <td className="px-4 py-2 text-gray-700">{fmtTime(r.clock_in_at)}</td>
                  <td className="px-4 py-2 text-gray-700">{fmtTime(r.clock_out_at)}</td>
                  <td className="px-4 py-2 text-gray-700">{fmtHours(r.clock_in_at, r.clock_out_at)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate" title={r.clock_in_location}>{r.clock_in_location || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
