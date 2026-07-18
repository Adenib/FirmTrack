'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SecuritySettingsPage() {
  const [mfaRequired, setMfaRequired] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/security-settings')
    const result = await res.json()
    if (res.ok) {
      setMfaRequired(result.settings.mfa_required)
    } else {
      setError(result.error || 'Could not load settings')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleToggle = async (value: boolean) => {
    setSaving(true)
    setError('')
    setSaved(false)

    const res = await fetch('/api/admin/security-settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mfa_required: value }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not save settings')
    } else {
      setMfaRequired(result.settings.mfa_required)
      setSaved(true)
    }
    setSaving(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          ← Admin
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Controls that apply to every user in your organization.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Require multi-factor authentication</p>
              <p className="text-xs text-gray-500 mt-1">
                When on, every user must set up an authenticator app after their next login. Turn this
                off only if your organization already enforces MFA at the identity-provider level (e.g.
                Microsoft Conditional Access).
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleToggle(!mfaRequired)}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
                mfaRequired ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  mfaRequired ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}
          {saved && <p className="text-green-600 text-xs">Settings saved.</p>}
        </div>
      )}
    </div>
  )
}
