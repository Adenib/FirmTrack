'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function DocTrackSettingsPage() {
  const [retentionDays, setRetentionDays] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/doctrack/settings')
    const result = await res.json()
    if (res.ok) {
      setRetentionDays(result.settings.retention_days ? String(result.settings.retention_days) : '')
    } else {
      setError(result.error || 'Could not load settings')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    const res = await fetch('/api/doctrack/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ retention_days: retentionDays ? Number(retentionDays) : null }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not save settings')
    } else {
      setRetentionDays(result.settings.retention_days ? String(result.settings.retention_days) : '')
      setSaved(true)
    }
    setSaving(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">DocTrack Settings</h1>
        <Link href="/doctrack" className="text-sm text-brand-blue hover:underline">
          ← DocTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">Document retention policy for your organization.</p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Retention period (days)</label>
            <input
              type="number"
              min="1"
              placeholder="Keep forever"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              className="w-40 px-2 py-1 border rounded text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Documents older than this are automatically archived (soft-deleted, never permanently removed).
              Leave blank to keep every document indefinitely.
            </p>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}
          {saved && <p className="text-green-600 text-xs">Settings saved.</p>}

          <button
            type="submit"
            disabled={saving}
            className="text-sm bg-brand-blue text-white px-3 py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
          >
            Save settings
          </button>
        </form>
      )}
    </div>
  )
}
