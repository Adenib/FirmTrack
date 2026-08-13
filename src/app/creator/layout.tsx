import Link from 'next/link'
import { getCreatorContext } from '@/lib/get-creator-context'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { HomeIcon, BuildingIcon, ChartBarIcon, UsersIcon, FileCheckIcon, FilePlusIcon, CalculatorIcon } from '@/components/brand/icons'

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await getCreatorContext()

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-gray-200 flex flex-col bg-gray-900 text-white">
        <div className="p-4 border-b border-gray-700">
          <p className="font-semibold">FirmTrack</p>
          <p className="text-xs text-gray-400">Creator Console</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <Link href="/creator" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800">
            <HomeIcon className="w-[18px] h-[18px]" />
            Overview
          </Link>
          {canAccessCreatorPage(admin.role, 'organizations') && (
            <Link href="/creator/organizations" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800">
              <BuildingIcon className="w-[18px] h-[18px]" />
              Organizations
            </Link>
          )}
          {canAccessCreatorPage(admin.role, 'signups') && (
            <Link href="/creator/signups" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800">
              <FilePlusIcon className="w-[18px] h-[18px]" />
              Signups
            </Link>
          )}
          {canAccessCreatorPage(admin.role, 'pricing') && (
            <Link href="/creator/pricing" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800">
              <CalculatorIcon className="w-[18px] h-[18px]" />
              Pricing
            </Link>
          )}
          {canAccessCreatorPage(admin.role, 'revenue') && (
            <Link href="/creator/revenue" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800">
              <ChartBarIcon className="w-[18px] h-[18px]" />
              Revenue
            </Link>
          )}
          {canAccessCreatorPage(admin.role, 'staff') && (
            <Link href="/creator/staff" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800">
              <UsersIcon className="w-[18px] h-[18px]" />
              Platform Staff
            </Link>
          )}
          {canAccessCreatorPage(admin.role, 'support') && (
            <Link href="/creator/support" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800">
              <FileCheckIcon className="w-[18px] h-[18px]" />
              Support
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <p className="text-sm truncate">{admin.email}</p>
          <p className="text-xs text-gray-400 capitalize">{admin.role}</p>
          <a href="/auth/signout" className="text-xs text-blue-400 hover:underline mt-1 inline-block">
            Sign out
          </a>
          <Link href="/dashboard" className="text-xs text-gray-400 hover:underline mt-1 block">
            ← Back to my organization
          </Link>
        </div>
      </aside>

      <main className="flex-1 bg-gray-50 overflow-y-auto">{children}</main>
    </div>
  )
}