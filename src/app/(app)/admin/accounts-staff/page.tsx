// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function AccountsStaffPage() {
  const [staff, setStaff] = useState([])
  const [categories, setCategories] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [userId, setUserId] = useState('')
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [initials, setInitials] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')

    const response = await fetch('/api/admin/accounts-staff')
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not load accounts staff')
      setLoading(false)
      return
    }

    setStaff(result.staff || [])
    setCategories(result.categories || [])
    setUsers(result.users || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setUserId('')
    setFullName('')
    setNickname('')
    setInitials('')
    setCategoryId('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/admin/accounts-staff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        full_name: fullName,
        nickname: nickname || null,
        initials: initials || null,
        category_id: categoryId || null,
        status: 'active',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not create accounts staff member')
      setSubmitting(false)
      return
    }

    resetForm()
    setSubmitting(false)
    await loadData()
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    setAddingCategory(true)

    const response = await fetch('/api/admin/accounts-categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName.trim(), sort_order: categories.length }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not create category')
      setAddingCategory(false)
      return
    }

    setNewCategoryName('')
    setAddingCategory(false)
    await loadData()
  }

  const handleToggleStatus = async (member) => {
    const nextStatus = member.status === 'active' ? 'inactive' : 'active'

    const response = await fetch('/api/admin/accounts-staff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: member.id, status: nextStatus }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not update accounts staff member')
      return
    }

    await loadData()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Accounts Staff</h1>
      <p className="text-gray-600 mb-6">
        Manage accounts-role staff and their tiers. Assign the &quot;Accounts&quot; role to a
        user on the Users page first, then add them here.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Categories (tiers)</p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400">No categories yet.</p>
          ) : (
            categories.map((c) => (
              <span key={c.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                {c.name}
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="e.g. Accounts 1"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          />
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={addingCategory || !newCategoryName.trim()}
            className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {addingCategory ? 'Adding...' : 'Add category'}
          </button>
        </div>
      </div>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">FirmTrack user (role: accounts)...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>

          <input
            type="text"
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />

          <input
            type="text"
            placeholder="Nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.toUpperCase())}
            className="px-3 py-2 border rounded-md uppercase"
          />

          <input
            type="text"
            placeholder="Initials"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            className="px-3 py-2 border rounded-md uppercase"
          />

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add accounts staff'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : staff.length === 0 ? (
        <p className="text-gray-500">No accounts staff yet. Add your first one above.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Nickname</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-gray-900">{member.nickname || '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{member.full_name}</td>
                  <td className="px-4 py-2 text-gray-700">{member.users?.email || '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{member.accounts_categories?.name || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        member.status === 'active'
                          ? 'text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full'
                          : 'text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full'
                      }
                    >
                      {member.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleToggleStatus(member)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {member.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
