'use client'

import { useState } from 'react'

export default function VendorPortalLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const result = await res.json()

    if (!res.ok) {
      setError(result.error || 'Login failed')
      setLoading(false)
      return
    }
    window.location.href = '/vendor-portal/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white border border-gray-200 rounded-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Vendor Portal</h1>
        <p className="text-sm text-gray-600 mb-6">Sign in with the account your customer set up for you.</p>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <form onSubmit={handleLogin} className="space-y-3">
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <button disabled={loading} className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
