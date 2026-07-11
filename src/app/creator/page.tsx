import { createClient } from '@supabase/supabase-js'
import { getCreatorContext } from '@/lib/get-creator-context'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function CreatorOverviewPage() {
  await getCreatorContext()

  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, plan, is_active')

  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('module, tier, is_active, price_per_user')

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id')

  const totalOrgs = orgs?.length || 0
  const activeOrgs = orgs?.filter((o) => o.is_active).length || 0
  const totalUsers = users?.length || 0

  const planCounts: Record<string, number> = {}
  orgs?.forEach((o) => {
    planCounts[o.plan] = (planCounts[o.plan] || 0) + 1
  })

  const activeSubs = subscriptions?.filter((s) => s.is_active) || []
  const estimatedMonthlyRevenue = activeSubs.reduce(
    (sum, s) => sum + (s.price_per_user || 0),
    0
  )

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Platform Overview</h1>
      <p className="text-gray-600 mb-8">Birds-eye view across all FirmTrack organizations.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Total organizations</p>
          <p className="text-2xl font-semibold text-gray-900">{totalOrgs}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Active organizations</p>
          <p className="text-2xl font-semibold text-gray-900">{activeOrgs}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Total users</p>
          <p className="text-2xl font-semibold text-gray-900">{totalUsers}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-600 mb-1">Est. monthly revenue (per-seat)</p>
          <p className="text-2xl font-semibold text-blue-700">
            ₦{Math.round(estimatedMonthlyRevenue).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="font-semibold text-gray-900 mb-3">Organizations by plan</p>
        <div className="space-y-2">
          {Object.entries(planCounts).map(([plan, count]) => (
            <div key={plan} className="flex items-center justify-between text-sm">
              <span className="capitalize text-gray-700">{plan}</span>
              <span className="font-medium text-gray-900">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Revenue figure is a per-seat estimate based on active subscription pricing × 1 seat per module row.
        Actual revenue depends on real seat counts once usage-based billing is wired up.
      </p>
    </div>
  )
}