'use client'

import { useState } from 'react'
import Link from 'next/link'

const MODULES = [
  'timetrack', 'movementtrack', 'tasktrack',
  'billtrack', 'accounttrack', 'doctrack', 'hrtrack', 'admin', 'ai_support', 'aitrack'
]

// Modules that participate in standard tier/rebate pricing -- 'admin' is
// bundled free with every org and has no tier/price of its own, so it's
// excluded from the "every module active" bundle-rebate eligibility check
// and from the tier/price controls below.
const PRICED_MODULES = MODULES.filter((m) => m !== 'admin')

const TIERS = ['free', 'basic', 'standard', 'elite']
const MODULE_TIERS = ['basic', 'standard', 'elite']

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

  const [tierEdits, setTierEdits] = useState<Record<string, string>>({})
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({})
  const [busyModule, setBusyModule] = useState<string | null>(null)

  const [rebatePercent, setRebatePercent] = useState('10')
  const [applyingRebate, setApplyingRebate] = useState(false)

  const subMap = Object.fromEntries(subscriptions.map((s) => [s.module, s]))
  const allModulesActive = PRICED_MODULES.every((m) => subMap[m]?.is_active)

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

  const handleChangeTier = async (module: string) => {
    const newTier = tierEdits[module]
    if (!newTier) return
    setBusyModule(module)
    setMessage('')
    const response = await fetch('/api/creator/update-subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, module, tier: newTier }),
    })
    const result = await response.json()
    setBusyModule(null)
    if (!response.ok) setMessage(result.error || 'Failed to change tier.')
    else window.location.reload()
  }

  const handleSavePriceOverride = async (module: string) => {
    const price = priceEdits[module]
    if (price === undefined || price === '' || isNaN(Number(price)) || Number(price) < 0) {
      setMessage('Enter a valid non-negative price first.')
      return
    }
    setBusyModule(module)
    setMessage('')
    const response = await fetch('/api/creator/update-subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, module, price_per_user: Number(price) }),
    })
    const result = await response.json()
    setBusyModule(null)
    if (!response.ok) setMessage(result.error || 'Failed to set price override.')
    else window.location.reload()
  }

  const handleApplyRebate = async () => {
    setApplyingRebate(true)
    setMessage('')
    const response = await fetch('/api/creator/apply-bundle-rebate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, discountPercent: Number(rebatePercent) }),
    })
    const result = await response.json()
    setApplyingRebate(false)
    if (!response.ok) setMessage(result.error || 'Failed to apply bundle rebate.')
    else window.location.reload()
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/creator/organizations" className="text-sm text-blue-600 hover:underline mb-4 block">
        ← Back to organizations
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">{org.name}</h1>
      <p className="text-gray-500 text-sm mb-6">{org.slug} · Created {new Date(org.created_at).toLocaleDateString()}</p>

      {message && <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-3 py-2 mb-4">{message}</p>}

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
        </div>
      </div>

      {/* Module management */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Modules</h2>
        <p className="text-xs text-gray-500 mb-4">
          Tier changes and price overrides update this org&apos;s own records only -- they don&apos;t
          change an already-active Paystack charge for this org. Standard prices (applied to every
          tenant) are managed under Pricing.
        </p>
        <div className="space-y-3">
          {MODULES.map((module) => {
            const sub = subMap[module]
            const isActive = sub?.is_active ?? false
            const isPriced = PRICED_MODULES.includes(module)
            return (
              <div key={module} className="py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between">
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
                {isPriced && (
                  <div className="flex items-center gap-4 mt-2 pl-0">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={tierEdits[module] ?? sub?.tier ?? 'basic'}
                        onChange={(e) => setTierEdits((prev) => ({ ...prev, [module]: e.target.value }))}
                        className="px-2 py-1 border rounded text-xs capitalize"
                      >
                        {MODULE_TIERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleChangeTier(module)}
                        disabled={busyModule === module || (tierEdits[module] ?? sub?.tier) === sub?.tier}
                        className="text-xs border border-gray-300 px-2 py-1 rounded-md hover:bg-gray-50 disabled:opacity-50"
                      >
                        Change tier
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">₦</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="Override price"
                        value={priceEdits[module] ?? ''}
                        onChange={(e) => setPriceEdits((prev) => ({ ...prev, [module]: e.target.value }))}
                        className="w-28 px-2 py-1 border rounded text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleSavePriceOverride(module)}
                        disabled={busyModule === module || !priceEdits[module]}
                        className="text-xs border border-gray-300 px-2 py-1 rounded-md hover:bg-gray-50 disabled:opacity-50"
                      >
                        Set price
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {allModulesActive && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-900 mb-1">Bundle rebate</p>
            <p className="text-xs text-gray-500 mb-2">
              Every module is active for this org. Apply a discount percentage across all of them --
              updates this org&apos;s records only, same as a tier change or price override above.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={99}
                value={rebatePercent}
                onChange={(e) => setRebatePercent(e.target.value)}
                className="w-20 px-2 py-1 border rounded text-sm"
              />
              <span className="text-sm text-gray-500">% off</span>
              <button
                type="button"
                onClick={handleApplyRebate}
                disabled={applyingRebate}
                className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {applyingRebate ? 'Applying...' : 'Apply bundle rebate'}
              </button>
            </div>
          </div>
        )}
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
