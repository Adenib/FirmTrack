// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function SignupsClient() {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/creator/signups')
    const result = await res.json()
    if (res.ok) setOrgs(result.organizations || [])
    else setError(result.error || 'Could not load pending signups')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleApprove = async (org) => {
    setBusyId(org.id)
    setError('')
    const res = await fetch('/api/creator/signups', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: org.id }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not approve organization')
    else await load()
    setBusyId(null)
  }

  const handleReject = async (org) => {
    if (!confirm(`Reject "${org.name}"? This permanently deletes the organization and its owner account.`)) return
    setBusyId(org.id)
    setError('')
    const res = await fetch('/api/creator/signups', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: org.id }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not reject organization')
    else await load()
    setBusyId(null)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Signups</h1>
      <p className="text-gray-600 mb-6">
        New organizations awaiting approval. They can&apos;t log in until you approve them here.
      </p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : orgs.length === 0 ? (
        <p className="text-gray-500 text-sm">No pending signups.</p>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => {
            const owner = (org.users || []).find((u) => u.role === 'owner')
            return (
              <div key={org.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{org.name}</p>
                  <p className="text-xs text-gray-500">{owner?.email || 'No owner found'}</p>
                  <p className="text-xs text-gray-400">Signed up {new Date(org.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApprove(org)}
                    disabled={busyId === org.id}
                    className="text-sm bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(org)}
                    disabled={busyId === org.id}
                    className="text-sm border border-red-300 text-red-600 px-3 py-2 rounded-md hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
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
