// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

const MODULES = [
  { key: 'timetrack', label: 'TimeTrack' },
  { key: 'movementtrack', label: 'MovementTrack' },
  { key: 'tasktrack', label: 'TaskTrack' },
  { key: 'billtrack', label: 'BillTrack' },
  { key: 'accounttrack', label: 'AccountTrack' },
  { key: 'doctrack', label: 'DocTrack' },
  { key: 'hrtrack', label: 'HRTrack' },
  { key: 'ai_support', label: 'AI Support Assistant' },
]

const TIERS = ['basic', 'standard', 'elite']

export default function PricingClient() {
  const [priceTable, setPriceTable] = useState({})
  const [edits, setEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/creator/pricing')
    const result = await res.json()
    if (res.ok) setPriceTable(result.priceTable || {})
    else setError(result.error || 'Could not load pricing')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const cellKey = (module, tier) => `${module}:${tier}`

  const valueFor = (module, tier) => {
    const editKey = cellKey(module, tier)
    if (edits[editKey] !== undefined) return edits[editKey]
    return priceTable[module]?.[tier] ?? 0
  }

  const handleChange = (module, tier, value) => {
    setEdits((prev) => ({ ...prev, [cellKey(module, tier)]: value }))
  }

  const handleSave = async (module, tier) => {
    const editKey = cellKey(module, tier)
    const price = Number(edits[editKey])
    if (isNaN(price) || price < 0) {
      setError('Enter a valid non-negative price first')
      return
    }
    setSavingKey(editKey)
    setError('')
    setMessage('')
    const res = await fetch('/api/creator/pricing', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ module, tier, price }),
    })
    const result = await res.json()
    setSavingKey(null)
    if (!res.ok) {
      setError(result.error || 'Could not update price')
      return
    }
    setMessage(
      result.paystackSynced
        ? `Updated ${module} / ${tier}, and synced the live Paystack plan amount.`
        : result.paystackError
          ? `Updated ${module} / ${tier}. Paystack sync failed: ${result.paystackError}`
          : `Updated ${module} / ${tier}. No linked Paystack plan for this module/tier -- record updated, nothing live to sync.`
    )
    setEdits((prev) => {
      const next = { ...prev }
      delete next[editKey]
      return next
    })
    await load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Pricing</h1>
      <p className="text-gray-600 mb-6">
        Standard per-module price by tier, used by checkout and the pricing calculator. Changing a
        price here syncs the live Paystack plan amount when one is linked for that module/tier
        (affects every org on that shared plan) -- it does not change any individual org&apos;s
        existing subscription price, and does not retroactively re-bill anyone. Per-org tier
        changes, overrides, and rebates are set on each organization&apos;s own page.
      </p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {message && <p className="text-green-600 text-sm mb-4">{message}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Module</th>
                {TIERS.map((t) => (
                  <th key={t} className="text-left px-4 py-3 text-gray-500 font-medium capitalize">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MODULES.map((mod) => (
                <tr key={mod.key}>
                  <td className="px-4 py-3 font-medium text-gray-900">{mod.label}</td>
                  {TIERS.map((tier) => {
                    const editKey = cellKey(mod.key, tier)
                    const dirty = edits[editKey] !== undefined && Number(edits[editKey]) !== (priceTable[mod.key]?.[tier] ?? 0)
                    return (
                      <td key={tier} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs">₦</span>
                          <input
                            type="number"
                            min={0}
                            value={valueFor(mod.key, tier)}
                            onChange={(e) => handleChange(mod.key, tier, e.target.value)}
                            className="w-24 px-2 py-1 border rounded text-sm"
                          />
                          {dirty && (
                            <button
                              type="button"
                              onClick={() => handleSave(mod.key, tier)}
                              disabled={savingKey === editKey}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                              {savingKey === editKey ? 'Saving...' : 'Save'}
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
