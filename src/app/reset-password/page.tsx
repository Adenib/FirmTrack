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

  // token_hash is the primary path: the Reset Password email template is
  // configured to link directly here with ?token_hash=...&type=recovery,
  // verified via verifyOtp() — which needs no code-verifier cookie at all,
  // so it works no matter which browser/device opens the link (checking
  // email on a phone while the reset was requested on a desktop browser is
  // the common case, and PKCE's code_verifier is by design only available
  // in the browser session that originated the request, breaking that).
  // ?code= and #access_token= are kept as fallbacks in case the email
  // template ever reverts to Supabase's default confirmation-link format.
  // None of these must reuse /auth/callback: that route treats any
  // first-time code exchange for an existing profile as "just log them
  // in," which would silently skip the password change entirely.
  useEffect(() => {
    const supabase = createClient()
    const searchParams = new URLSearchParams(window.location.search)
    const tokenHash = searchParams.get('token_hash')
    const otpType = searchParams.get('type')
    const code = searchParams.get('code')
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
    } else if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: (otpType as 'recovery') || 'recovery' }).then(({ error: verifyError }) => {
        if (verifyError) {
          setError('This reset link has expired or already been used. Please request a new one.')
          return
        }
        setReady(true)
      })
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
    fetch('/api/auth/reset-password-completed', { method: 'POST' }).catch(() => {})
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
