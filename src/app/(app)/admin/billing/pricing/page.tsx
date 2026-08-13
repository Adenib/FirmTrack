'use client'

import { useState, useMemo, useEffect } from 'react'
import { MODULES, type Tier, type ModuleKey, type PriceTable, moduleMonthlyPriceFromTable } from '@/lib/billing/pricing'

type Billing = 'monthly' | 'annual'

export default function PricingCalculatorPage() {
  const [users, setUsers] = useState(5)
  const [tier, setTier] = useState<Tier>('standard')
  const [billing, setBilling] = useState<Billing>('monthly')
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(MODULES.map((m) => m.key))
  )
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState('')

  // Live standard pricing (editable via the Creator Console) -- fetched
  // once so what's shown here is exactly what checkout will charge.
  const [priceTable, setPriceTable] = useState<PriceTable>({})
  useEffect(() => {
    fetch('/api/billing/pricing')
      .then((r) => r.json())
      .then((body) => setPriceTable(body.priceTable || {}))
      .catch(() => {})
  }, [])

  const toggleModule = (key: string) => {
    setSelectedModules((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const { perUserPeriod, teamMonthly, periodTotal, periodLabel } = useMemo(() => {
    let perUserMonthly = 0

    MODULES.forEach((mod) => {
      if (!selectedModules.has(mod.key)) return
      perUserMonthly += moduleMonthlyPriceFromTable(tier, mod.key as ModuleKey, priceTable)
    })

    const isAnnual = billing === 'annual'
    const annualMultiplier = 12 * 0.9

    const teamMonthlyValue = perUserMonthly * users
    const perUserPeriodValue = isAnnual ? perUserMonthly * annualMultiplier : perUserMonthly
    const periodTotalValue = isAnnual ? teamMonthlyValue * annualMultiplier : teamMonthlyValue

    return {
      perUserPeriod: perUserPeriodValue,
      teamMonthly: teamMonthlyValue,
      periodTotal: periodTotalValue,
      periodLabel: isAnnual ? 'Per year' : 'Per month',
    }
  }, [users, tier, billing, selectedModules, priceTable])

  const fmt = (n: number) => '₦' + Math.round(n).toLocaleString()

  const handleSubscribe = async () => {
    setSubscribing(true)
    setSubscribeError('')

    const res = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modules: Array.from(selectedModules), tier, currency: 'NGN' }),
    })
    const result = await res.json()

    if (!res.ok) {
      setSubscribeError(result.error || 'Failed to initialize payment')
      setSubscribing(false)
      return
    }

    window.location.href = result.authorization_url
  }

  const canSubscribe = billing === 'monthly' && selectedModules.size > 0

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Pricing calculator</h1>
      <p className="text-gray-600 mb-6">
        Estimate subscription cost based on team size, tier, and modules.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500 block mb-2">Team size</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={users}
                onChange={(e) => setUsers(parseInt(e.target.value, 10))}
                className="flex-1"
              />
              <span className="text-sm font-medium w-8 text-right">{users}</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 block mb-2">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="elite">Elite</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Billing</span>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name="billing"
              checked={billing === 'monthly'}
              onChange={() => setBilling('monthly')}
            />
            Monthly
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name="billing"
              checked={billing === 'annual'}
              onChange={() => setBilling('annual')}
            />
            Annual (10% off)
          </label>
        </div>

        <div>
          <p className="text-sm text-gray-500 mb-2">Modules</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MODULES.map((mod) => (
              <label
                key={mod.key}
                className="flex items-center gap-2 text-sm cursor-pointer py-1"
              >
                <input
                  type="checkbox"
                  checked={selectedModules.has(mod.key)}
                  onChange={() => toggleModule(mod.key)}
                />
                {mod.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Per user</p>
            <p className="text-xl font-semibold text-gray-900">{fmt(perUserPeriod)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Team total / month</p>
            <p className="text-xl font-semibold text-gray-900">{fmt(teamMonthly)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs text-blue-600 mb-1">{periodLabel}</p>
            <p className="text-xl font-semibold text-blue-700">{fmt(periodTotal)}</p>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={!canSubscribe || subscribing}
            className="bg-brand-blue text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-brand-blue-hover disabled:opacity-50"
          >
            {subscribing ? 'Redirecting to payment...' : 'Subscribe now'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            You&apos;ll be billed for your organization&apos;s actual active users, not the Team
            size slider above (that&apos;s an estimator only).
          </p>
          {billing === 'annual' && (
            <p className="text-xs text-amber-600 mt-1">
              Annual billing isn&apos;t available for checkout yet — switch to Monthly to
              subscribe.
            </p>
          )}
          {selectedModules.size === 0 && (
            <p className="text-xs text-amber-600 mt-1">Select at least one module to subscribe.</p>
          )}
          {subscribeError && <p className="text-red-600 text-xs mt-1">{subscribeError}</p>}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Basic tier: core modules (TimeTrack, MovementTrack, TaskTrack, BillTrack) at ₦{(priceTable.timetrack?.basic ?? 0).toLocaleString()}/user/month.
        AccountTrack, DocTrack, and HRTrack are ₦{(priceTable.accounttrack?.basic ?? 0).toLocaleString()}/user/month add-ons on Basic.
        Standard and Elite bundle all modules at a per-module rate, editable per module in the Creator Console.
      </p>
    </div>
  )
}
