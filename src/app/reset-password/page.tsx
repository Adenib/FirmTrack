'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // The emailed link lands here one of two ways depending on whether the
  // browser opening it has the code-verifier cookie from the request (same
  // browser/device): ?code=... (PKCE, exchanged below) — or, very commonly
  // in practice (clicking the link from a phone's mail app, a different
  // browser than the one that requested the reset, etc.), no matching
  // verifier is found and Supabase falls back to the implicit flow instead,
  // landing here with #access_token=...&refresh_token=... in the hash
  // fragment. Both must be handled or cross-device resets silently fail.
  // This must NOT reuse /auth/callback either way: that route treats any
  // first-time code exchange for an existing profile as "just log them
  // in," which would silently skip the password change entirely.
  useEffect(() => {
    const supabase = createClient()
    const code = new URLSearchParams(window.location.search).get('code')
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const hashError = hashParams.get('error_description')

    if (hashError) {
      // Supabase forwards a failed verification (already-used or expired
      // token) as #error=...&error_description=... rather than a code or
      // access_token — distinct from the link simply having no auth data
      // at all, so this gets its own message rather than falling through
      // to the generic "invalid or missing" case below.
      setError(decodeURIComponent(hashError.replace(/\+/g, ' ')))
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) {
          setError('This reset link has expired or already been used. Please request a new one.')
          return
        }
        setReady(true)
      })
    } else if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
        if (sessionError) {
          setError('This reset link has expired or already been used. Please request a new one.')
          return
        }
        setReady(true)
      })
    } else {
      setError('This reset link is invalid or missing. Please request a new one.')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setDone(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6">Set a new password</h1>

        {done ? (
          <>
            <p className="text-sm text-gray-700 mb-4">Your password has been updated.</p>
            <a href="/dashboard" className="text-blue-600 hover:underline text-sm">
              Continue to dashboard →
            </a>
          </>
        ) : ready ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">New password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Confirm new password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Set new password'}
            </button>
          </form>
        ) : error ? (
          <>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <a href="/forgot-password" className="text-blue-600 hover:underline text-sm">
              Request a new reset link →
            </a>
          </>
        ) : (
          <p className="text-sm text-gray-500">Verifying reset link...</p>
        )}
      </div>
    </div>
  )
}
