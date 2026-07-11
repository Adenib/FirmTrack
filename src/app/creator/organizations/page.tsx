import { createClient } from '@supabase/supabase-js'
import { getCreatorContext } from '@/lib/get-creator-context'
import Link from 'next/link'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function CreatorOrganizationsPage() {
  await getCreatorContext()

  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: userCounts } = await supabaseAdmin
    .from('users')
    .select('tenant_id')

  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('tenant_id, module, tier, is_active')

  const userCountMap: Record<string, number> = {}
  userCounts?.forEach((u) => {
    userCountMap[u.tenant_id] = (userCountMap[u.tenant_id] || 0) + 1
  })

  const activeModuleMap: Record<string, number> = {}
  subscriptions?.forEach((s) => {
    if (s.is_active) {
      activeModuleMap[s.tenant_id] = (activeModuleMap[s.tenant_id] || 0) + 1
    }
  })

  const planBadge: Record<string, string> = {
    free: 'bg-gray-100 text-gray-600',
    basic: 'bg-blue-100 text-blue-700',
    standard: 'bg-green-100 text-green-700',
    elite: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Organizations</h1>
      <p className="text-gray-600 mb-6">
        All FirmTrack tenant organizations. Click any row to manage subscriptions.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Organization</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Plan</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Users</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Active modules</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orgs?.map((org) => (
              <tr key={org.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{org.name}</p>
                  <p className="text-xs text-gray-400">{org.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${planBadge[org.plan] || 'bg-gray-100 text-gray-600'}`}>
                    {org.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{userCountMap[org.id] || 0}</td>
                <td className="px-4 py-3 text-gray-700">{activeModuleMap[org.id] || 0}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${org.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {org.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(org.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/creator/organizations/${org.id}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}