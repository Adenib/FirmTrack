import { getUserContext } from '@/lib/get-user-context'

export default async function DashboardPage() {
  const { profile, organization, activeModules } = await getUserContext()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
      <p className="text-gray-600 mb-8">
        {organization?.name} · <span className="capitalize">{organization?.plan}</span> plan
      </p>

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