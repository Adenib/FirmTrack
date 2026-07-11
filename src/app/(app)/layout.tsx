'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import UpgradeModal from '@/components/ui/upgrade-modal'

const MODULES = [
  { key: 'timetrack', label: 'TimeTrack', icon: 'ti-clock', href: '/timetrack' },
  { key: 'movementtrack', label: 'MovementTrack', icon: 'ti-map-pin', href: '/movementtrack' },
  { key: 'tasktrack', label: 'TaskTrack', icon: 'ti-checklist', href: '/tasktrack' },
  { key: 'billtrack', label: 'BillTrack', icon: 'ti-receipt', href: '/billtrack' },
  { key: 'accounttrack', label: 'AccountTrack', icon: 'ti-chart-bar', href: '/accounttrack' },
  { key: 'doctrack', label: 'DocTrack', icon: 'ti-file-text', href: '/doctrack' },
  { key: 'hrtrack', label: 'HRTrack', icon: 'ti-id-badge', href: '/hrtrack' },
  { key: 'calentrack', label: 'CalenTrack', icon: 'ti-calendar', href: '/calentrack' },
  { key: 'admin', label: 'Admin', icon: 'ti-settings', href: '/admin' },
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
          {MODULES.map((mod) => {
            const isActive = activeModules.includes(mod.key)
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