'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { challengeAndVerifyWithRetry } from '@/lib/mfa-verify'

export default function MfaEnrollPage() {
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  useEffect(() => {
    const supabase = createClient()
    // A unique friendly name per attempt -- Supabase rejects re-enrolling
    // with a name that already exists on an unverified factor, which would
    // otherwise permanently strand anyone who reloads this page or gets
    // bounced back here before finishing (e.g. a stray middleware redirect).
    // The stray unverified factor(s) this leaves behind are harmless (only
    // a *verified* factor counts toward aal2) and get pruned server-side
    // once this attempt actually succeeds -- see /api/mfa/enrolled.
    supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator-${Date.now()}` }).then(({ data, error: enrollError }) => {
      if (enrollError || !data) {
        setError(enrollError?.message || 'Could not start MFA enrollment')
      } else {
        setFactorId(data.id)
        setQrCode(data.totp.qr_code)
        setSecret(data.totp.secret)
      }
      setLoading(false)
    })
  }, [])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    setError('')

    const supabase = createClient()
    const { error: verifyError } = await challengeAndVerifyWithRetry(supabase, factorId, code)
    if (verifyError) {
      setError(verifyError.message)
      setVerifying(false)
      return
    }

    fetch('/api/mfa/enrolled', { method: 'POST' }).catch(() => {})

    // Owner/admin get self-service backup codes; the route 403s for
    // everyone else, which just means they fall through to /dashboard.
    const backupRes = await fetch('/api/mfa/backup-codes', { method: 'POST' })
    if (backupRes.ok) {
      const result = await backupRes.json()
      setBackupCodes(result.codes)
      setVerifying(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  if (backupCodes) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
          <h1 className="text-2xl font-bold mb-2">Save your backup codes</h1>
          <p className="text-sm text-gray-600 mb-4">
            Each code can be used once to sign in if you lose access to your authenticator app. Store
            them somewhere safe -- they will not be shown again.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-4 grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => (window.location.href = '/dashboard')}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
          >
            I've saved these codes -- continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-2">Set up multi-factor authentication</h1>
        <p className="text-sm text-gray-600 mb-6">
          Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.),
          then enter the 6-digit code it generates.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : qrCode ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- qrCode is a data: URI from Supabase, not a static asset next/image can optimize */}
            <img src={qrCode} alt="Scan with your authenticator app" className="mx-auto mb-4 w-48 h-48" />
            <p className="text-xs text-gray-500 text-center mb-6">
              Can't scan it? Enter this code manually: <span className="font-mono">{secret}</span>
            </p>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md tracking-widest text-center"
                  maxLength={6}
                />
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={verifying}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {verifying ? 'Verifying...' : 'Verify and continue'}
              </button>
            </form>
          </>
        ) : (
          error && <p className="text-red-600 text-sm">{error}</p>
        )}
      </div>
    </div>
  )
}
