'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function TimeTrackSettingsPage() {
  const [aiDraftingEnabled, setAiDraftingEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/timetrack/settings')
    const result = await res.json()
    if (res.ok) {
      setAiDraftingEnabled(!!result.settings.ai_drafting_enabled)
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

    const res = await fetch('/api/timetrack/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ai_drafting_enabled: aiDraftingEnabled }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not save settings')
    } else {
      setAiDraftingEnabled(!!result.settings.ai_drafting_enabled)
      setSaved(true)
    }
    setSaving(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">TimeTrack Settings</h1>
        <Link href="/timetrack" className="text-sm text-brand-blue hover:underline">
          ← TimeTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">AI-assisted time entry drafting for your organization.</p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={aiDraftingEnabled}
              onChange={(e) => setAiDraftingEnabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Enable AI-assisted drafting</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                When on, staff can click &quot;Draft with AI&quot; on a linked calendar event to get a
                suggested billing narrative and task code, which they review and edit before saving.
                Off by default. Any individual staff member can also hide the button for just
                themselves regardless of this setting.
              </span>
            </span>
          </label>

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
