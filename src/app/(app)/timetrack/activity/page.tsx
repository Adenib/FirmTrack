// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MatterSearchInput from '@/components/timetrack/matter-search-input'
import useTimetrackLookups, { lawyerRateFor } from '@/components/timetrack/use-timetrack-lookups'

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${seconds % 60}s`
}

function ConvertForm({ activity, lawyers, taskCodes, onCancel, onConverted }) {
  const [matter, setMatter] = useState(null)
  const [matterQuery, setMatterQuery] = useState('')
  const [lawyerId, setLawyerId] = useState('')
  const [taskCodeId, setTaskCodeId] = useState('')
  const [hours, setHours] = useState((activity.duration_seconds / 3600).toFixed(2))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const rate = matter
    ? lawyerRateFor(lawyers.find((l) => l.id === lawyerId), matter.rate_type)
    : null

  const handleSubmit = async () => {
    if (!matter) {
      setError('Select a matter first')
      return
    }
    setSubmitting(true)
    setError('')

    const parsedHours = parseFloat(hours) || 0
    const response = await fetch('/api/timetrack/activity', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: activity.id,
        entry: {
          matter_id: matter.id,
          lawyer_id: lawyerId || null,
          task_code_id: taskCodeId || null,
          entry_date: activity.logged_at.split('T')[0],
          hours: parsedHours,
          rate: rate || 0,
          amount: parsedHours * (rate || 0),
          explanation: activity.window_title || null,
        },
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not convert activity')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onConverted()
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mt-2 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="sm:col-span-2">
          <MatterSearchInput
            value={matterQuery}
            onChange={setMatterQuery}
            onSelect={(m) => {
              setMatter(m)
              setMatterQuery(`${m.matter_id} · ${m.case_name}`)
            }}
          />
        </div>
        <select
          value={lawyerId}
          onChange={(e) => setLawyerId(e.target.value)}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="">Lawyer</option>
          {lawyers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nickname}
            </option>
          ))}
        </select>
        <select
          value={taskCodeId}
          onChange={(e) => setTaskCodeId(e.target.value)}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="">Task</option>
          {taskCodes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-20 px-2 py-1 border rounded text-sm"
        />
        <span className="text-xs text-gray-500">
          hrs {rate !== null && <>· rate {rate.toFixed(2)} · amount {((parseFloat(hours) || 0) * rate).toFixed(2)}</>}
        </span>
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Converting...' : 'Convert to time entry'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ActivityLogPage() {
  const { lawyers, taskCodes } = useTimetrackLookups()
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [convertingId, setConvertingId] = useState(null)

  const [keys, setKeys] = useState([])
  const [newKey, setNewKey] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [showKeys, setShowKeys] = useState(false)

  const ACTIVITY_PAGE_SIZE = 5
  const [visibleActivityCount, setVisibleActivityCount] = useState(ACTIVITY_PAGE_SIZE)

  const loadActivity = async () => {
    setLoading(true)
    const response = await fetch('/api/timetrack/activity?unconverted=1')
    const result = await response.json()
    if (response.ok) setActivity(result.activity || [])
    setVisibleActivityCount(ACTIVITY_PAGE_SIZE)
    setLoading(false)
  }

  const loadKeys = async () => {
    const response = await fetch('/api/timetrack/agent-keys')
    const result = await response.json()
    if (response.ok) setKeys(result.keys || [])
  }

  useEffect(() => {
    loadActivity()
    loadKeys()
  }, [])

  const handleGenerateKey = async () => {
    setGenerating(true)
    setKeyError('')
    const response = await fetch('/api/timetrack/agent-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Desktop agent' }),
    })
    const result = await response.json()
    if (!response.ok) {
      setKeyError(result.error || 'Could not generate key')
      setGenerating(false)
      return
    }
    setNewKey(result.key.raw_key)
    setGenerating(false)
    await loadKeys()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <Link href="/timetrack" className="text-sm text-blue-600 hover:underline">
          ← Time Sheet
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Review activity tracked by the desktop agent and convert it into time entries.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8">
        <p className="font-medium text-gray-900 mb-1">Desktop agent</p>
        <p className="text-sm text-gray-500 mb-3">
          Generate an API key and use it to configure the FirmTrack desktop agent on your
          Windows PC. Activity tracked with this key is attributed to your account, so generate
          your own key rather than sharing one.
        </p>

        {newKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3 text-sm">
            <p className="text-amber-800 mb-1">
              Copy this key now — it will not be shown again.
            </p>
            <code className="block bg-white border border-amber-200 rounded px-2 py-1 text-xs break-all">
              {newKey}
            </code>
          </div>
        )}

        {keyError && <p className="text-red-600 text-sm mb-3">{keyError}</p>}

        <button
          type="button"
          onClick={handleGenerateKey}
          disabled={generating}
          className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 mb-3"
        >
          {generating ? 'Generating...' : 'Generate new agent key'}
        </button>

        {keys.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowKeys((v) => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showKeys ? 'Hide keys' : `Show keys (${keys.length})`}
            </button>

            {showKeys && (
              <div className="space-y-1 mt-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-100 pt-1">
                    <span>
                      {k.key_prefix}… {k.label ? `(${k.label})` : ''}
                    </span>
                    <span>{k.revoked_at ? 'Revoked' : k.last_used_at ? `Last used ${k.last_used_at.split('T')[0]}` : 'Never used'}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : activity.length === 0 ? (
        <p className="text-gray-500">No untracked activity yet.</p>
      ) : (
        <div className="space-y-2">
          {activity.slice(0, visibleActivityCount).map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{a.window_title || 'Untitled window'}</p>
                  <p className="text-xs text-gray-500">
                    {a.process_name} · {formatDuration(a.duration_seconds)} · {new Date(a.logged_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConvertingId(convertingId === a.id ? null : a.id)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {convertingId === a.id ? 'Close' : 'Convert to entry'}
                </button>
              </div>

              {convertingId === a.id && (
                <ConvertForm
                  activity={a}
                  lawyers={lawyers}
                  taskCodes={taskCodes}
                  onCancel={() => setConvertingId(null)}
                  onConverted={() => {
                    setConvertingId(null)
                    loadActivity()
                  }}
                />
              )}
            </div>
          ))}

          {visibleActivityCount < activity.length && (
            <button
              type="button"
              onClick={() => setVisibleActivityCount((n) => n + ACTIVITY_PAGE_SIZE)}
              className="text-sm text-blue-600 hover:underline"
            >
              Show more ({activity.length - visibleActivityCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
