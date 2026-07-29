import Link from 'next/link'
import { getUserContext } from '@/lib/get-user-context'
import { getPartnerKpis } from '@/lib/dashboard/partner-kpis'

function fmtUsd(n: number) {
  return `₦${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function DashboardPage() {
  const { profile, organization, activeModules } = await getUserContext()
  const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
  const kpis = isPrivileged ? await getPartnerKpis(profile.tenant_id, activeModules) : null

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
      <p className="text-gray-600 mb-8">
        {organization?.name} · <span className="capitalize">{organization?.plan}</span> plan
      </p>

      {kpis && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Firm Performance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {kpis.billing && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">Billing this month</p>
                <p className="text-xl font-semibold text-gray-900">{fmtUsd(kpis.billing.invoicedUsd)}</p>
                <p className="text-xs text-gray-500 mt-1">invoiced · {fmtUsd(kpis.billing.collectedUsd)} collected</p>
                <p className="text-xs text-amber-600 mt-1">{fmtUsd(kpis.billing.outstandingUsd)} outstanding</p>
                <Link href="/billtrack/reports" className="text-xs text-brand-blue hover:underline mt-2 inline-block">
                  View BillTrack reports &rarr;
                </Link>
              </div>
            )}

            {kpis.trust && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">Trust account balance</p>
                <p className="text-xl font-semibold text-gray-900">{fmtUsd(kpis.trust.balanceUsd)}</p>
                <p className="text-xs text-gray-500 mt-1">client funds currently held</p>
                <Link href="/accounttrack/statements" className="text-xs text-brand-blue hover:underline mt-2 inline-block">
                  View statements &rarr;
                </Link>
              </div>
            )}

            {kpis.productivity && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">Team productivity this month</p>
                <p className="text-xl font-semibold text-gray-900">{kpis.productivity.billableHours.toFixed(1)} hrs</p>
                <p className="text-xs text-gray-500 mt-1">
                  billable of {kpis.productivity.totalHours.toFixed(1)} hrs logged
                  {kpis.productivity.avgUtilization !== null &&
                    ` · ${(kpis.productivity.avgUtilization * 100).toFixed(0)}% utilization`}
                </p>
                <Link href="/accounttrack/lawyer-overview" className="text-xs text-brand-blue hover:underline mt-2 inline-block">
                  View lawyer overview &rarr;
                </Link>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2">Matters</p>
              <p className="text-xl font-semibold text-gray-900">{kpis.matters.active} active</p>
              <p className="text-xs text-gray-500 mt-1">{kpis.matters.newThisMonth} opened this month</p>
              <Link href="/admin/matters" className="text-xs text-brand-blue hover:underline mt-2 inline-block">
                New matter &rarr;
              </Link>
            </div>
          </div>

          {kpis.topClients && kpis.topClients.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-3">Top clients by revenue this year</p>
              <div className="space-y-2">
                {kpis.topClients.map((c) => (
                  <div key={c.clientName} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{c.clientName}</span>
                    <span className="font-medium text-gray-900">{fmtUsd(c.revenueUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Your role</p>
          <p className="text-lg font-semibold capitalize text-gray-900">{profile?.role}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Active modules</p>
          <p className="text-lg font-semibold text-gray-900">{activeModules.size}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Email</p>
          <p className="text-lg font-semibold text-gray-900 truncate">{profile?.email}</p>
        </div>
      </div>

      <p className="text-sm text-gray-500 mt-8">
        Use the sidebar to open a module. Locked modules need a plan upgrade to unlock.
      </p>
    </div>
  )
}
