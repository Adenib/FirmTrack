'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { challengeAndVerifyWithRetry } from '@/lib/mfa-verify'
import AuthCard from '@/components/auth/auth-card'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // A recovery-link session only reaches aal1 -- Supabase Auth requires
  // aal2 to change the password on an MFA-enrolled account and rejects
  // updateUser() with "AAL2 session is required..." otherwise. That error
  // was previously surfacing straight to the user with no way past it, so
  // an MFA-enrolled account could never actually complete a self-service
  // reset. This mirrors /mfa/challenge's verify step, staying on this page
  // (rather than redirecting to /dashboard) so the password form can run
  // right after.
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaVerified, setMfaVerified] = useState(false)
  const [factorId, setFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaVerifying, setMfaVerifying] = useState(false)
  const [canUseBackupCode, setCanUseBackupCode] = useState(false)
  const [usingBackupCode, setUsingBackupCode] = useState(false)

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

    // Runs once the recovery link is verified (aal1). If the account has
    // an MFA factor enrolled, the password form must wait for a challenge
    // to elevate the session to aal2 first -- otherwise updateUser() would
    // just fail with Supabase's "AAL2 session is required" error.
    const onVerified = async () => {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const totpFactor = factorsData?.totp?.find((f) => f.status === 'verified')
      if (totpFactor) {
        setFactorId(totpFactor.id)
        setMfaRequired(true)

        const { data: userData } = await supabase.auth.getUser()
        if (userData.user) {
          const { data: profile } = await supabase.from('users').select('role').eq('id', userData.user.id).single()
          setCanUseBackupCode(!!profile && ['owner', 'admin'].includes(profile.role))
        }
      }
      setReady(true)
    }

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
        onVerified()
      })
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) {
          setError('This reset link has expired or already been used. Please request a new one.')
          return
        }
        onVerified()
      })
    } else if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
        if (sessionError) {
          setError('This reset link has expired or already been used. Please request a new one.')
          return
        }
        onVerified()
      })
    } else {
      setError('This reset link is invalid or missing. Please request a new one.')
    }
  }, [])

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setMfaVerifying(true)
    setMfaError('')

    const supabase = createClient()
    const { error: verifyError } = await challengeAndVerifyWithRetry(supabase, factorId, mfaCode)
    setMfaVerifying(false)
    if (verifyError) {
      setMfaError(verifyError.message)
      return
    }
    setMfaVerified(true)
  }

  const handleRedeemBackupCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setMfaVerifying(true)
    setMfaError('')

    const res = await fetch('/api/mfa/backup-codes/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: mfaCode }),
    })
    const result = await res.json()
    setMfaVerifying(false)
    if (!res.ok) {
      setMfaError(result.error || 'Could not redeem backup code')
      return
    }
    // Redeeming deletes the old factor server-side -- the account is back
    // to unenrolled, so the password change can proceed without aal2.
    setMfaVerified(true)
  }

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
    <AuthCard>
      <h1 className="text-2xl font-bold mb-6 text-center">Set a new password</h1>

      {done ? (
        <>
          <p className="text-sm text-gray-700 mb-4">Your password has been updated.</p>
          <a href="/dashboard" className="text-brand-blue hover:underline text-sm">
            Continue to dashboard →
          </a>
        </>
      ) : ready && mfaRequired && !mfaVerified ? (
        <>
          <p className="text-sm text-gray-600 mb-6">
            {usingBackupCode
              ? 'Enter one of your backup codes to continue.'
              : 'This account has two-factor authentication enabled. Enter the 6-digit code from your authenticator app to continue.'}
          </p>
          <form onSubmit={usingBackupCode ? handleRedeemBackupCode : handleMfaVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {usingBackupCode ? 'Backup code' : '6-digit code'}
              </label>
              <input
                type="text"
                inputMode={usingBackupCode ? 'text' : 'numeric'}
                required
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-md tracking-widest text-center"
                maxLength={usingBackupCode ? 11 : 6}
              />
            </div>

            {mfaError && <p className="text-red-600 text-sm">{mfaError}</p>}

            <button
              type="submit"
              disabled={mfaVerifying}
              className="w-full bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
            >
              {mfaVerifying ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          {canUseBackupCode && (
            <button
              type="button"
              onClick={() => {
                setUsingBackupCode(!usingBackupCode)
                setMfaCode('')
                setMfaError('')
              }}
              className="w-full text-sm text-brand-blue hover:underline mt-4"
            >
              {usingBackupCode ? 'Use my authenticator app instead' : 'Use a backup code instead'}
            </button>
          )}
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
            className="w-full bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Set new password'}
          </button>
        </form>
      ) : error ? (
        <>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <a href="/forgot-password" className="text-brand-blue hover:underline text-sm">
            Request a new reset link →
          </a>
        </>
      ) : (
        <p className="text-sm text-gray-500">Verifying reset link...</p>
      )}
    </AuthCard>
  )
}
