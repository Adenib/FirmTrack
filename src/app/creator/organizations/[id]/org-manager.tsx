'use client'

import { useState } from 'react'
import Link from 'next/link'

const MODULES = [
  'timetrack', 'movementtrack', 'tasktrack',
  'billtrack', 'accounttrack', 'doctrack', 'hrtrack', 'admin'
]

const TIERS = ['free', 'basic', 'standard', 'elite']

type Org = {
  id: string
  name: string
  slug: string
  plan: string
  is_active: boolean
  annual_billing: boolean
  created_at: string
}

type Subscription = {
  id: string
  module: string
  tier: string
  is_active: boolean
  price_per_user: number | null
}

type User = {
  id: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export default function OrgManager({
  org,
  subscriptions,
  users,
}: {
  org: Org
  subscriptions: Subscription[]
  users: User[]
}) {
  const [plan, setPlan] = useState(org.plan)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const subMap = Object.fromEntries(subscriptions.map((s) => [s.module, s]))

  const handlePlanChange = async () => {
    setSaving(true)
    setMessage('')

    const response = await fetch('/api/creator/update-org', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, plan }),
    })

    const result = await response.json()
    setSaving(false)
    setMessage(response.ok ? 'Plan updated successfully.' : result.error || 'Failed to update.')
  }

  const handleToggleModule = async (module: string, currentlyActive: boolean) => {
    const response = await fetch('/api/creator/update-subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orgId: org.id,
        module,
        is_active: !currentlyActive,
      }),
    })
    const result = await response.json()
    if (!response.ok) setMessage(result.error || 'Failed to update module.')
    else window.location.reload()
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/creator/organizations" className="text-sm text-blue-600 hover:underline mb-4 block">
        ← Back to organizations
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">{org.name}</h1>
      <p className="text-gray-500 text-sm mb-6">{org.slug} · Created {new Date(org.created_at).toLocaleDateString()}</p>

      {/* Plan management */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Plan</h2>
        <div className="flex items-center gap-3">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <button
            onClick={handlePlanChange}
            disabled={saving || plan === org.plan}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Update plan'}
          </button>
          {message && <p className="text-sm text-green-600">{message}</p>}
        </div>
      </div>

      {/* Module management */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Modules</h2>
        <div className="space-y-2">
          {MODULES.map((module) => {
            const sub = subMap[module]
            const isActive = sub?.is_active ?? false
            return (
              <div key={module} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium capitalize text-gray-900">{module}</p>
                  <p className="text-xs text-gray-500 capitalize">{sub?.tier ?? 'not set'} · ₦{sub?.price_per_user ?? 0}/user/mo</p>
                </div>
                <button
                  onClick={() => handleToggleModule(module, isActive)}
                  className={`text-xs px-3 py-1 rounded-md ${isActive ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                >
                  {isActive ? 'Disable' : 'Enable'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Users */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Users ({users.length})</h2>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between text-sm py-1">
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
      </div>
    </div>
  )
}