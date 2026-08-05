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
  const [me, setMe] = useState<{ id: string } | null>(null)
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null)
  // Keyed by user id -- a role-change/deactivate/etc. failure needs to show
  // up next to the row it actually happened on, not just in the create-form
  // error banner at the top of the page where nothing points to which row
  // failed (previously the only place `error` was ever rendered).
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

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
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setMe(data.user ? { id: data.user.id } : null))
  }, [])

  const setRowError = (id: string, message: string) =>
    setRowErrors((prev) => ({ ...prev, [id]: message }))

  const handleRoleChange = async (id: string, newRole: string) => {
    setSavingRoleFor(id)
    setRowError(id, '')
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, role: newRole }),
      })
      const result = await response.json()
      if (!response.ok) setRowError(id, result.error || 'Could not change role')
    } catch {
      setRowError(id, 'Could not change role -- check your connection and try again')
    }
    setSavingRoleFor(null)
    await loadUsers()
  }

  const handleToggleActive = async (id: string, currentlyActive: boolean) => {
    setRowError(id, '')
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, reactivate: !currentlyActive }),
      })
      const result = await response.json()
      if (!response.ok) setRowError(id, result.error || 'Could not update status')
    } catch {
      setRowError(id, 'Could not update status -- check your connection and try again')
    }
    await loadUsers()
  }

  const handleRevokeSessions = async (id: string) => {
    setRowError(id, '')
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, revokeSessions: true }),
      })
      const result = await response.json()
      if (!response.ok) setRowError(id, result.error || 'Could not sign the user out')
    } catch {
      setRowError(id, 'Could not sign the user out -- check your connection and try again')
    }
  }

  const handleResetMfa = async (id: string) => {
    setRowError(id, '')
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, resetMfa: true }),
      })
      const result = await response.json()
      if (!response.ok) setRowError(id, result.error || 'Could not reset MFA for this user')
    } catch {
      setRowError(id, 'Could not reset MFA -- check your connection and try again')
    }
  }

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
            <option value="hr">HR</option>
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
          {users.map((u) => {
            const isSelf = u.id === me?.id
            const isOwner = u.role === 'owner'
            const locked = isSelf || isOwner
            return (
              <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{u.email}</p>
                  {locked ? (
                    <p className="text-xs text-gray-500 capitalize">{u.role}{isSelf ? ' (you)' : ''}</p>
                  ) : (
                    <select
                      value={u.role}
                      disabled={savingRoleFor === u.id}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="text-xs px-2 py-1 border rounded-md mt-1 capitalize"
                    >
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="accounts">Accounts</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  {rowErrors[u.id] && <p className="text-red-600 text-xs mt-1">{rowErrors[u.id]}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => handleToggleActive(u.id, u.is_active)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRevokeSessions(u.id)}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    Sign out everywhere
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetMfa(u.id)}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    Reset MFA
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}