'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import SsoButtons from '@/components/auth/sso-buttons'
import AuthCard from '@/components/auth/auth-card'
import { oauthScopesFor } from '@/lib/microsoft-graph/scopes'

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Something went wrong signing you in. Please try again.',
  confirmation_failed: 'That sign-in link has expired or already been used. Please try again.',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorCode = params.get('error')
    const detail = params.get('detail')
    if (errorCode === 'oauth_failed' && detail) {
      // Surfaces whatever Supabase/the provider actually said went wrong
      // (denied consent, misconfigured provider, redirect URI mismatch,
      // etc.) instead of a generic message -- see src/app/auth/callback/route.ts.
      setError(`Sign-in failed: ${detail}`)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (errorCode) {
      setError(OAUTH_ERROR_MESSAGES[errorCode] || 'Sign-in failed. Please try again.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Login failed')
      setLoading(false)
      return
    }

    if (result.mfaStep === 'challenge') {
      window.location.href = '/mfa/challenge'
    } else if (result.mfaStep === 'enroll') {
      window.location.href = '/mfa/enroll'
    } else {
      window.location.href = '/dashboard'
    }
  }

  return (
    <AuthCard tagline>
      <h1 className="text-2xl font-bold mb-6 text-center">Log in</h1>

      <form onSubmit={handleLogin} className="space-y-4">
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium">Password</label>
            <a href="/forgot-password" className="text-sm text-brand-blue hover:underline">
              Forgot password?
            </a>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <SsoButtons
        onSelect={(provider) => {
          const supabase = createClient()
          return supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: oauthScopesFor(provider) },
          })
        }}
      />

      <p className="text-sm text-center mt-4">
        Don't have an account?{' '}
        <a href="/register" className="text-brand-blue hover:underline">
          Sign up
        </a>
      </p>
    </AuthCard>
  )
}
