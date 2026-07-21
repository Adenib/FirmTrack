'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AuthCard from '@/components/auth/auth-card'

export default function CompleteSignupPage() {
  const [orgName, setOrgName] = useState('')
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        window.location.href = '/login'
        return
      }

      // Defensive -- handles a stray revisit to this page by someone who
      // already finished setting up their organization.
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle()
      if (profile) {
        window.location.href = '/dashboard'
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')
      setLoading(false)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, email, orgName, agreementAccepted }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not finish setting up your account')
      setSubmitting(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <AuthCard>
      <h1 className="text-2xl font-bold mb-2 text-center">One more step</h1>
      <p className="text-sm text-gray-600 mb-6 text-center">
        You're signed in as {email || '...'}. What's your organization called?
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization name</label>
            <input
              type="text"
              required
              autoFocus
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g. Compnet Systems"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              required
              checked={agreementAccepted}
              onChange={(e) => setAgreementAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I have read and agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">
                User Agreement
              </a>
              , including the Security Guaranty.
            </span>
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !agreementAccepted}
            className="w-full bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Continue'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}
