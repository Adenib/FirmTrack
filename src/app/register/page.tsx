'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import SsoButtons from '@/components/auth/sso-buttons'
import AuthCard from '@/components/auth/auth-card'
import { oauthScopesFor } from '@/lib/microsoft-graph/scopes'

export default function RegisterPage() {
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError || !authData.user) {
      setError(authError?.message || 'Registration failed')
      setLoading(false)
      return
    }

    await supabase.auth.signInWithPassword({ email, password })

    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: authData.user.id,
        email,
        orgName,
        agreementAccepted,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Registration failed')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <AuthCard tagline>
      <h1 className="text-2xl font-bold mb-6 text-center">Create your account</h1>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Organization name</label>
          <input
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="e.g. Compnet Systems"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
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
          disabled={loading || !agreementAccepted}
          className="w-full bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <SsoButtons
        label="Sign up with"
        onSelect={(provider) => {
          const supabase = createClient()
          return supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: oauthScopesFor(provider) },
          })
        }}
      />

      <p className="text-sm text-center mt-4">
        Already have an account?{' '}
        <a href="/login" className="text-brand-blue hover:underline">
          Log in
        </a>
      </p>
    </AuthCard>
  )
}
