'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { challengeAndVerifyWithRetry } from '@/lib/mfa-verify'

export default function MfaChallengePage() {
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [canUseBackupCode, setCanUseBackupCode] = useState(false)
  const [usingBackupCode, setUsingBackupCode] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.getUser(),
    ]).then(async ([{ data: factorsData, error: factorsError }, { data: userData }]) => {
      if (factorsError || !factorsData?.totp?.[0]) {
        setError(factorsError?.message || 'No authenticator factor found')
        setLoading(false)
        return
      }
      setFactorId(factorsData.totp[0].id)

      if (userData.user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', userData.user.id).single()
        setCanUseBackupCode(!!profile && ['owner', 'admin'].includes(profile.role))
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
    window.location.href = '/dashboard'
  }

  const handleRedeemBackupCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    setError('')

    const res = await fetch('/api/mfa/backup-codes/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not redeem backup code')
      setVerifying(false)
      return
    }
    // Redeeming deletes the old factor server-side -- back to unenrolled.
    window.location.href = '/mfa/enroll'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-2">Two-factor verification</h1>
        <p className="text-sm text-gray-600 mb-6">
          {usingBackupCode
            ? 'Enter one of your backup codes.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <form onSubmit={usingBackupCode ? handleRedeemBackupCode : handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {usingBackupCode ? 'Backup code' : '6-digit code'}
              </label>
              <input
                type="text"
                inputMode={usingBackupCode ? 'text' : 'numeric'}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-md tracking-widest text-center"
                maxLength={usingBackupCode ? 11 : 6}
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={verifying}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}

        {!loading && canUseBackupCode && (
          <button
            type="button"
            onClick={() => {
              setUsingBackupCode(!usingBackupCode)
              setCode('')
              setError('')
            }}
            className="w-full text-sm text-blue-600 hover:underline mt-4"
          >
            {usingBackupCode ? 'Use my authenticator app instead' : 'Use a backup code instead'}
          </button>
        )}
      </div>
    </div>
  )
}
