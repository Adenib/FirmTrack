// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const CADRES = ['admin', 'accounts', 'developer']

const cadreBadge = {
  admin: 'bg-purple-100 text-purple-700',
  accounts: 'bg-blue-100 text-blue-700',
  developer: 'bg-green-100 text-green-700',
  creator: 'bg-gray-200 text-gray-700',
}

export default function StaffClient({ currentAdminId }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [cadre, setCadre] = useState('developer')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/creator/staff')
    const result = await res.json()
    if (res.ok) setStaff(result.staff || [])
    else setError(result.error || 'Could not load staff')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')

    const res = await fetch('/api/creator/staff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName, nickname, cadre }),
    })
    const result = await res.json()
    if (!res.ok) {
      setFormError(result.error || 'Could not add staff member')
    } else {
      setEmail('')
      setPassword('')
      setFullName('')
      setNickname('')
      setCadre('developer')
      await load()
    }
    setSubmitting(false)
  }

  const handleToggleStatus = async (member) => {
    setBusyId(member.id)
    setError('')
    const res = await fetch('/api/creator/staff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: member.id, status: member.status === 'active' ? 'inactive' : 'active' }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not update status')
    else await load()
    setBusyId(null)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Platform Staff</h1>
      <p className="text-gray-600 mb-6">
        Give people access to the Creator Console. Admin sees everything; Accounts sees Overview + Revenue;
        Developer sees Overview + Organizations.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <p className="font-medium text-gray-900 mb-3">Add staff</p>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Full name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nickname</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cadre</label>
            <select value={cadre} onChange={(e) => setCadre(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
              {CADRES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add staff'}
            </button>
          </div>
        </form>
        {formError && <p className="text-red-600 text-xs mt-2">{formError}</p>}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Cadre</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Added</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{member.nickname || member.full_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{member.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${cadreBadge[member.role] || 'bg-gray-100 text-gray-600'}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(member.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {member.role !== 'creator' && (
                      <button
                        type="button"
                        disabled={busyId === member.id || (member.id === currentAdminId && member.status === 'active')}
                        onClick={() => handleToggleStatus(member)}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        title={member.id === currentAdminId ? "You can't deactivate your own access" : undefined}
                      >
                        {member.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
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
