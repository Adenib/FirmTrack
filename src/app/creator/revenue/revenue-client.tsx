'use client'

import { useState, useMemo } from 'react'

type Subscription = {
  tenant_id: string
  module: string
  tier: string
  is_active: boolean
  price_per_user: number | null
  billing_cycle_start: string | null
  billing_cycle_end: string | null
  annual_billing: boolean
  created_at: string
}

type Org = {
  id: string
  name: string
  plan: string
}

type User = {
  tenant_id: string
}

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString()

export default function RevenueClient({
  subscriptions,
  orgs,
  users,
}: {
  subscriptions: Subscription[]
  orgs: Org[]
  users: User[]
}) {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o]))

  const userCountMap: Record<string, number> = {}
  users.forEach((u) => {
    userCountMap[u.tenant_id] = (userCountMap[u.tenant_id] || 0) + 1
  })

  const activeSubs = useMemo(() => {
    return subscriptions.filter((s) => {
      if (!s.is_active || !s.price_per_user || s.price_per_user === 0) return false
      if (fromDate && s.created_at < fromDate) return false
      if (toDate && s.created_at > toDate + 'T23:59:59') return false
      return true
    })
  }, [subscriptions, fromDate, toDate])

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

  const allActiveSubs = subscriptions.filter((s) => s.is_active && s.price_per_user && s.price_per_user > 0)

  const calcRevenue = (subs: Subscription[]) =>
    subs.reduce((sum, s) => {
      const seats = userCountMap[s.tenant_id] || 1
      return sum + (s.price_per_user || 0) * seats
    }, 0)

  const totalAllTime = calcRevenue(allActiveSubs)

  const thisMonthSubs = allActiveSubs.filter((s) => {
    const d = new Date(s.created_at)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const lastMonthSubs = allActiveSubs.filter((s) => {
    const d = new Date(s.created_at)
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
  })

  const thisMonthRevenue = calcRevenue(thisMonthSubs)
  const lastMonthRevenue = calcRevenue(lastMonthSubs)
  const filteredRevenue = calcRevenue(activeSubs)

  const monthChange = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
    : null

  // Revenue by org
  const revenueByOrg: Record<string, number> = {}
  allActiveSubs.forEach((s) => {
    const seats = userCountMap[s.tenant_id] || 1
    revenueByOrg[s.tenant_id] = (revenueByOrg[s.tenant_id] || 0) + (s.price_per_user || 0) * seats
  })

  // Revenue by module
  const revenueByModule: Record<string, number> = {}
  allActiveSubs.forEach((s) => {
    const seats = userCountMap[s.tenant_id] || 1
    revenueByModule[s.module] = (revenueByModule[s.module] || 0) + (s.price_per_user || 0) * seats
  })

  const sortedOrgs = Object.entries(revenueByOrg)
    .sort(([, a], [, b]) => b - a)

  const sortedModules = Object.entries(revenueByModule)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Revenue</h1>
      <p className="text-gray-600 mb-6">Platform-wide subscription revenue across all organizations.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-600 mb-1">All-time (active subs)</p>
          <p className="text-2xl font-semibold text-blue-700">{fmt(totalAllTime)}</p>
          <p className="text-xs text-blue-500 mt-1">{allActiveSubs.length} active subscription rows</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">This month</p>
          <p className="text-2xl font-semibold text-gray-900">{fmt(thisMonthRevenue)}</p>
          {monthChange !== null && (
            <p className={`text-xs mt-1 ${parseFloat(monthChange) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {parseFloat(monthChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(monthChange))}% vs last month
            </p>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Last month</p>
          <p className="text-2xl font-semibold text-gray-900">{fmt(lastMonthRevenue)}</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Custom date range filter</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <div className="pt-4">
            <p className="text-sm text-gray-500">Filtered revenue:</p>
            <p className="text-xl font-semibold text-gray-900">{fmt(filteredRevenue)}</p>
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate('') }}
              className="pt-4 text-xs text-blue-600 hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* By organization */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-3">By organization</h2>
          {sortedOrgs.length === 0 ? (
            <p className="text-sm text-gray-500">No paid subscriptions yet.</p>
          ) : (
            <div className="space-y-3">
              {sortedOrgs.map(([orgId, revenue]) => (
                <div key={orgId} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{orgMap[orgId]?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500 capitalize">{orgMap[orgId]?.plan} plan · {userCountMap[orgId] || 0} users</p>
                  </div>
                  <p className="font-semibold text-gray-900">{fmt(revenue)}<span className="text-xs text-gray-400">/mo</span></p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By module */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-3">By module</h2>
          {sortedModules.length === 0 ? (
            <p className="text-sm text-gray-500">No paid subscriptions yet.</p>
          ) : (
            <div className="space-y-3">
              {sortedModules.map(([module, revenue]) => (
                <div key={module} className="flex items-center justify-between text-sm">
                  <p className="font-medium text-gray-900 capitalize">{module}</p>
                  <p className="font-semibold text-gray-900">{fmt(revenue)}<span className="text-xs text-gray-400">/mo</span></p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Revenue is estimated based on price_per_user × user count per subscription row.
        Actual collected revenue will reflect Paystack transactions once billing is wired up.
      </p>
    </div>
  )
}