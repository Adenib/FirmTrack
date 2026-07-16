'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import UpgradeModal from '@/components/ui/upgrade-modal'

const MODULES = [
  { key: 'timetrack', label: 'TimeTrack', icon: 'ti-clock', href: '/timetrack' },
  { key: 'billtrack', label: 'BillTrack', icon: 'ti-receipt', href: '/billtrack' },
  { key: 'accounttrack', label: 'AccountTrack', icon: 'ti-chart-bar', href: '/accounttrack' },
  { key: 'doctrack', label: 'DocTrack', icon: 'ti-file-text', href: '/doctrack' },
  { key: 'hrtrack', label: 'HRTrack', icon: 'ti-id-badge', href: '/hrtrack' },
  { key: 'calentrack', label: 'CalenTrack', icon: 'ti-calendar', href: '/calentrack' },
  { key: 'admin', label: 'Admin', icon: 'ti-settings', href: '/admin' },
]

// MovementTrack and TaskTrack live under the HRTrack nav group now, but
// keep their OWN subscription gating exactly as before (both are free
// modules today; hrtrack is a separate paid one — folding their gating
// into hrtrack would silently turn free functionality paid, which this
// nav reorganization does not do).
const HR_GROUP_ITEMS = [
  { key: 'hrtrack', label: 'Attendance', icon: 'ti-clock', href: '/hrtrack/attendance' },
  { key: 'movementtrack', label: 'Movement', icon: 'ti-map-pin', href: '/hrtrack/movement' },
  { key: 'tasktrack', label: 'Performance', icon: 'ti-checklist', href: '/hrtrack/performance' },
  { key: 'hrtrack', label: 'Requests', icon: 'ti-file-description', href: '/hrtrack/requests' },
  { key: 'hrtrack', label: 'Payroll', icon: 'ti-cash', href: '/hrtrack/payroll' },
  { key: 'hrtrack', label: 'Reports', icon: 'ti-report', href: '/hrtrack/reports' },
]

type LayoutData = {
  organization: { name: string; plan: string } | null
  profile: { email: string; role: string } | null
  activeModules: string[]
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LayoutData>({
    organization: null,
    profile: null,
    activeModules: [],
  })
  const [upgradeModule, setUpgradeModule] = useState<string | null>(null)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/layout-data')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)

    // Check for payment result in URL
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      setPaymentMessage('Payment successful! Your module is now active.')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('payment') === 'failed') {
      setPaymentMessage('Payment failed. Please try again.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const { organization, profile, activeModules } = data
  // Owner/admin see every module (locked ones included, as an upsell surface).
  // Everyone else only sees modules their tenant currently subscribes to —
  // no "Locked" upsell noise for staff who can't act on it anyway.
  const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
  // The 'hrtrack' entry must stay visible if the tenant has EITHER an
  // hrtrack subscription OR movementtrack/tasktrack (now reached only
  // through the HRTrack group) — otherwise a tenant with just the free
  // movementtrack/tasktrack modules active, but no hrtrack subscription,
  // would lose access to features they already have.
  const hrGroupHasAnyActiveItem = HR_GROUP_ITEMS.some((item) => activeModules.includes(item.key))
  const visibleModules = isPrivileged
    ? MODULES
    : MODULES.filter((mod) => activeModules.includes(mod.key) || (mod.key === 'hrtrack' && hrGroupHasAnyActiveItem))

  return (
    <div className="min-h-screen flex">
      {upgradeModule && (
        <UpgradeModal
          module={upgradeModule}
          onClose={() => setUpgradeModule(null)}
        />
      )}

      <aside className="w-60 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <p className="font-semibold text-gray-900 truncate">{organization?.name || '...'}</p>
          <p className="text-xs text-gray-500 capitalize">{organization?.plan || ''} plan</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <i className="ti ti-home" style={{ fontSize: 18 }} />
            Dashboard
          </Link>
<Link
            href="/admin/matters"
            className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <i className="ti ti-file-plus" style={{ fontSize: 18 }} />
            New Matter
          </Link>
          {visibleModules.map((mod) => {
            const isActive = activeModules.includes(mod.key)

            if (mod.key === 'hrtrack') {
              const visibleSubItems = isPrivileged
                ? HR_GROUP_ITEMS
                : HR_GROUP_ITEMS.filter((item) => activeModules.includes(item.key))
              if (visibleSubItems.length === 0) return null

              return (
                <div key="hrtrack-group">
                  <Link
                    href="/hrtrack"
                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <i className={`ti ${mod.icon}`} style={{ fontSize: 18 }} />
                    {mod.label}
                  </Link>
                  {visibleSubItems.map((item) => {
                    const subActive = activeModules.includes(item.key)
                    return subActive ? (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 pl-10 pr-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <i className={`ti ${item.icon}`} style={{ fontSize: 14 }} />
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        key={item.href}
                        onClick={() => setUpgradeModule(item.key)}
                        className="w-full flex items-center justify-between gap-3 pl-10 pr-4 py-1.5 text-sm text-gray-400 hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-3">
                          <i className={`ti ${item.icon}`} style={{ fontSize: 14 }} />
                          {item.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Locked
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            }

            return isActive ? (
              <Link
                key={mod.key}
                href={mod.href}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-3">
                  <i className={`ti ${mod.icon}`} style={{ fontSize: 18 }} />
                  {mod.label}
                </span>
              </Link>
            ) : (
              <button
                key={mod.key}
                onClick={() => setUpgradeModule(mod.key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-gray-400 hover:bg-gray-50"
              >
                <span className="flex items-center gap-3">
                  <i className={`ti ${mod.icon}`} style={{ fontSize: 18 }} />
                  {mod.label}
                </span>
                <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  Locked
                </span>
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          {paymentMessage && (
            <p className={`text-xs mb-2 ${paymentMessage.includes('successful') ? 'text-green-600' : 'text-red-600'}`}>
              {paymentMessage}
            </p>
          )}
          <p className="text-sm font-medium text-gray-900 truncate">{profile?.email || ''}</p>
          <p className="text-xs text-gray-500 capitalize">{profile?.role || ''}</p>
          <a href="/auth/signout" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
            Sign out
          </a>
        </div>
      </aside>

      <main className="flex-1 bg-gray-50 overflow-y-auto">{children}</main>
    </div>
  )
}