'use client'

import { useState, useMemo } from 'react'

const MODULES = [
  { key: 'timetrack', label: 'TimeTrack', free: true },
  { key: 'movementtrack', label: 'MovementTrack', free: true },
  { key: 'tasktrack', label: 'TaskTrack', free: true },
  { key: 'billtrack', label: 'BillTrack', free: true },
  { key: 'accounttrack', label: 'AccountTrack', free: false },
  { key: 'doctrack', label: 'DocTrack', free: false },
  { key: 'hrtrack', label: 'HRTrack', free: false },
] as const

const PRICES: Record<'basic' | 'standard' | 'elite', number> = {
  basic: 1500,
  standard: 2500,
  elite: 4000,
}

const ADDON_PRICE_BASIC = 2000

type Tier = 'basic' | 'standard' | 'elite'
type Billing = 'monthly' | 'annual'

export default function PricingCalculatorPage() {
  const [users, setUsers] = useState(5)
  const [tier, setTier] = useState<Tier>('standard')
  const [billing, setBilling] = useState<Billing>('monthly')
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(MODULES.map((m) => m.key))
  )

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
      if (tier === 'basic') {
        perUserMonthly += mod.free ? PRICES.basic : ADDON_PRICE_BASIC
      } else {
        perUserMonthly += PRICES[tier]
      }
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
  }, [users, tier, billing, selectedModules])

  const fmt = (n: number) => '₦' + Math.round(n).toLocaleString()

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
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Basic tier: core modules (TimeTrack, MovementTrack, TaskTrack, BillTrack) at ₦1,500/user/month.
        AccountTrack, DocTrack, and HRTrack are ₦2,000/user/month add-ons on Basic.
        Standard and Elite bundle all modules at a flat per-module rate.
      </p>
    </div>
  )
}