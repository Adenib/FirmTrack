// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function BillTrackSettingsPage() {
  const [cadenceDays, setCadenceDays] = useState('7')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [maskedKey, setMaskedKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/billtrack/settings')
    const result = await res.json()
    if (res.ok) {
      setCadenceDays(String(result.settings.reminder_cadence_days))
      setFromEmail(result.settings.custom_from_email || '')
      setFromName(result.settings.custom_from_name || '')
      setMaskedKey(result.settings.custom_resend_api_key_masked)
    } else {
      setError(result.error || 'Could not load settings')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    const body = {
      reminder_cadence_days: Number(cadenceDays),
      custom_from_email: fromEmail,
      custom_from_name: fromName,
    }
    // Only send a new key if the admin actually typed one — leaves the
    // stored key untouched otherwise, since the real value is never sent
    // back to this page to begin with.
    if (apiKey.trim()) body.custom_resend_api_key = apiKey.trim()

    const res = await fetch('/api/billtrack/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not save settings')
    } else {
      setMaskedKey(result.settings.custom_resend_api_key_masked)
      setApiKey('')
      setSaved(true)
    }
    setSaving(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">BillTrack Settings</h1>
        <Link href="/billtrack" className="text-sm text-blue-600 hover:underline">
          ← BillTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Reminder cadence and optional custom email sender — leave the sender fields blank to use FirmTrack&apos;s
        shared default.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reminder cadence (days)</label>
            <input
              type="number"
              min="1"
              value={cadenceDays}
              onChange={(e) => setCadenceDays(e.target.value)}
              className="w-32 px-2 py-1 border rounded text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">How often an unpaid, non-paused invoice gets re-sent.</p>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-900 mb-2">Custom email sender (optional)</p>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From email</label>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="billing@yourfirm.com"
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">From name</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Your Firm Billing"
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Resend API key {maskedKey ? `(currently ${maskedKey})` : '(none set — using shared default)'}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave blank to keep current key"
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}
          {saved && <p className="text-green-600 text-xs">Settings saved.</p>}

          <button
            type="submit"
            disabled={saving}
            className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Save settings
          </button>
        </form>
      )}
    </div>
  )
}
