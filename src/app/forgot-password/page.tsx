'use client'

import { useState } from 'react'
import AuthCard from '@/components/auth/auth-card'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!response.ok) {
      const result = await response.json()
      setError(result.error || 'Something went wrong')
      setLoading(false)
      return
    }

    // Always show the same success message regardless of whether the
    // email is registered — avoids leaking which addresses have accounts.
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <AuthCard>
      <h1 className="text-2xl font-bold mb-6 text-center">Reset your password</h1>

      {submitted ? (
        <p className="text-sm text-gray-700">
          If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="text-sm text-center mt-4">
        <a href="/login" className="text-brand-blue hover:underline">
          Back to login
        </a>
      </p>
    </AuthCard>
  )
}
