'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import UpgradeModal from '@/components/ui/upgrade-modal'
import Logo from '@/components/brand/logo'
import {
  ClockIcon,
  ReceiptIcon,
  ChartBarIcon,
  FileCheckIcon,
  UsersIcon,
  CalendarIcon,
  SettingsIcon,
  HomeIcon,
  FilePlusIcon,
  ChevronRightIcon,
} from '@/components/brand/icons'

type SubItem = { key: string; label: string; href: string }
type ModuleEntry = {
  key: string
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  // Modules with no sub-pages (e.g. DocTrack today) render as a single
  // flat link/button instead of a collapsible group.
  subItems?: SubItem[]
}

// MovementTrack and TaskTrack live under the HRTrack group (via distinct
// keys), but keep their OWN subscription gating exactly as before (both
// are free modules today; hrtrack is a separate paid one — folding their
// gating into hrtrack would silently turn free functionality paid).
const MODULES: ModuleEntry[] = [
  {
    key: 'timetrack',
    label: 'TimeTrack',
    href: '/timetrack',
    icon: ClockIcon,
    subItems: [
      { key: 'timetrack', label: 'Overview', href: '/timetrack' },
      { key: 'timetrack', label: 'Activity', href: '/timetrack/activity' },
      { key: 'timetrack', label: 'Quick Fee', href: '/timetrack/quick-fee' },
      { key: 'timetrack', label: 'Reports', href: '/timetrack/reports' },
    ],
  },
  {
    key: 'billtrack',
    label: 'BillTrack',
    href: '/billtrack',
    icon: ReceiptIcon,
    subItems: [
      { key: 'billtrack', label: 'Overview', href: '/billtrack' },
      { key: 'billtrack', label: 'Reports', href: '/billtrack/reports' },
      { key: 'billtrack', label: 'Settings', href: '/billtrack/settings' },
    ],
  },
  {
    key: 'accounttrack',
    label: 'AccountTrack',
    href: '/accounttrack',
    icon: ChartBarIcon,
    subItems: [
      { key: 'accounttrack', label: 'Overview', href: '/accounttrack' },
      { key: 'accounttrack', label: 'Accounting Periods', href: '/accounttrack/accounting-periods' },
      { key: 'accounttrack', label: 'Registers', href: '/accounttrack/registers' },
      { key: 'accounttrack', label: 'Chart of Accounts', href: '/accounttrack/chart-of-accounts' },
      { key: 'accounttrack', label: 'Statements', href: '/accounttrack/statements' },
      { key: 'accounttrack', label: 'Lawyer Overview', href: '/accounttrack/lawyer-overview' },
    ],
  },
  {
    key: 'doctrack',
    label: 'DocTrack',
    href: '/doctrack',
    icon: FileCheckIcon,
    subItems: [
      { key: 'doctrack', label: 'Documents', href: '/doctrack' },
      { key: 'doctrack', label: 'Settings', href: '/doctrack/settings' },
    ],
  },
  {
    key: 'hrtrack',
    label: 'HRTrack',
    href: '/hrtrack',
    icon: UsersIcon,
    subItems: [
      { key: 'hrtrack', label: 'Attendance', href: '/hrtrack/attendance' },
      { key: 'movementtrack', label: 'Movement', href: '/hrtrack/movement' },
      { key: 'tasktrack', label: 'Performance', href: '/hrtrack/performance' },
      { key: 'hrtrack', label: 'Requests', href: '/hrtrack/requests' },
      { key: 'hrtrack', label: 'Payroll', href: '/hrtrack/payroll' },
      { key: 'hrtrack', label: 'Reports', href: '/hrtrack/reports' },
    ],
  },
  {
    key: 'calentrack',
    label: 'CalenTrack',
    href: '/calentrack',
    icon: CalendarIcon,
    subItems: [
      { key: 'calentrack', label: 'Overview', href: '/calentrack' },
      { key: 'calentrack', label: 'Reports', href: '/calentrack/reports' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    href: '/admin',
    icon: SettingsIcon,
    subItems: [
      { key: 'admin', label: 'Overview', href: '/admin' },
      { key: 'admin', label: 'Users', href: '/admin/users' },
      { key: 'admin', label: 'Lawyers', href: '/admin/lawyers' },
      { key: 'admin', label: 'Accounts Staff', href: '/admin/accounts-staff' },
      { key: 'admin', label: 'Clients', href: '/admin/clients' },
      { key: 'admin', label: 'Matters', href: '/admin/matters' },
      { key: 'admin', label: 'Import Data', href: '/admin/import' },
      { key: 'admin', label: 'Billing & Pricing', href: '/admin/billing/pricing' },
      { key: 'admin', label: 'Security Log', href: '/admin/security-log' },
      { key: 'admin', label: 'Security Settings', href: '/admin/security-settings' },
    ],
  },
]

type LayoutData = {
  organization: { name: string; plan: string } | null
  profile: { email: string; role: string } | null
  activeModules: string[]
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [data, setData] = useState<LayoutData>({
    organization: null,
    profile: null,
    activeModules: [],
  })
  const [upgradeModule, setUpgradeModule] = useState<string | null>(null)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  // Which module groups are expanded -- initialized once, below, to just
  // the group containing the current page. Plain component state (no
  // storage persistence): this layout instance persists across
  // client-side navigation for the rest of the session, so manual
  // toggles stay sticky until a full page reload, which is normal
  // collapsible-nav behavior.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const current = MODULES.find(
      (mod) => pathname === mod.href || mod.subItems?.some((item) => pathname.startsWith(item.href))
    )
    return new Set(current ? [current.key] : [])
  })

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

  const groupHasAnyActiveItem = (mod: ModuleEntry) =>
    mod.subItems ? mod.subItems.some((item) => activeModules.includes(item.key)) : activeModules.includes(mod.key)

  const visibleModules = isPrivileged ? MODULES : MODULES.filter((mod) => groupHasAnyActiveItem(mod))

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="min-h-screen flex">
      {upgradeModule && (
        <UpgradeModal
          module={upgradeModule}
          onClose={() => setUpgradeModule(null)}
        />
      )}

      <aside className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Logo size="sm" className="mb-3" />
          <p className="font-semibold text-gray-900 truncate">{organization?.name || '...'}</p>
          <p className="text-xs text-gray-500 capitalize">{organization?.plan || ''} plan</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-blue-50 ${
              pathname === '/dashboard' ? 'text-brand-blue font-medium bg-blue-50' : 'text-gray-700'
            }`}
          >
            <HomeIcon className="w-[18px] h-[18px]" />
            Dashboard
          </Link>
          <Link
            href="/admin/matters"
            className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-blue-50 ${
              pathname === '/admin/matters' ? 'text-brand-blue font-medium bg-blue-50' : 'text-gray-700'
            }`}
          >
            <FilePlusIcon className="w-[18px] h-[18px]" />
            New Matter
          </Link>

          {visibleModules.map((mod) => {
            const isActive = activeModules.includes(mod.key)

            // No sub-pages -- render as a single flat link/button, same as before.
            if (!mod.subItems) {
              return isActive ? (
                <Link
                  key={mod.key}
                  href={mod.href}
                  className={`flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-blue-50 ${
                    pathname.startsWith(mod.href) ? 'text-brand-blue font-medium bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <mod.icon className="w-[18px] h-[18px]" />
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
                    <mod.icon className="w-[18px] h-[18px]" />
                    {mod.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    Locked
                  </span>
                </button>
              )
            }

            const visibleSubItems = isPrivileged
              ? mod.subItems
              : mod.subItems.filter((item) => activeModules.includes(item.key))
            if (visibleSubItems.length === 0) return null

            const isExpanded = expanded.has(mod.key)
            const allLocked = mod.subItems.every((item) => !activeModules.includes(item.key))

            return (
              <div key={mod.key}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(mod.key)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span className="flex items-center gap-3">
                    <mod.icon className="w-[18px] h-[18px]" />
                    {mod.label}
                  </span>
                  <span className="flex items-center gap-2">
                    {allLocked && (
                      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        Locked
                      </span>
                    )}
                    <ChevronRightIcon
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </span>
                </button>
                {isExpanded &&
                  visibleSubItems.map((item) => {
                    const subActive = activeModules.includes(item.key)
                    const subIsCurrent = pathname === item.href
                    return subActive ? (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 pl-10 pr-4 py-1.5 text-sm hover:bg-blue-50 ${
                          subIsCurrent ? 'text-brand-blue font-medium bg-blue-50' : 'text-gray-600'
                        }`}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        key={item.href}
                        onClick={() => setUpgradeModule(item.key)}
                        className="w-full flex items-center justify-between gap-3 pl-10 pr-4 py-1.5 text-sm text-gray-400 hover:bg-gray-50"
                      >
                        <span>{item.label}</span>
                        <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Locked
                        </span>
                      </button>
                    )
                  })}
              </div>
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
          <Link href="/account" className="text-xs text-brand-blue hover:underline mt-1 inline-block mr-3">
            My Account
          </Link>
          <a href="/auth/signout" className="text-xs text-brand-blue hover:underline mt-1 inline-block">
            Sign out
          </a>
        </div>
      </aside>

      <main className="flex-1 bg-gray-50 overflow-y-auto">{children}</main>
    </div>
  )
}
