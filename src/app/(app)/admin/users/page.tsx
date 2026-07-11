'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type TeamUser = {
  id: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('staff')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, role }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not create user')
      setSubmitting(false)
      return
    }

    setEmail('')
    setPassword('')
    setRole('staff')
    setSubmitting(false)
    await loadUsers()
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Users</h1>
      <p className="text-gray-600 mb-6">Manage your team members and their roles.</p>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Temporary password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="accounts">Accounts</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add team member'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{u.email}</p>
                <p className="text-xs text-gray-500 capitalize">{u.role}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {u.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}