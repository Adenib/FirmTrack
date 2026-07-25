import Link from 'next/link'
import { getUserContext } from '@/lib/get-user-context'
import {
  UsersIcon,
  BriefcaseIcon,
  CalculatorIcon,
  FilePlusIcon,
  BuildingIcon,
  FileUploadIcon,
  CreditCardIcon,
  ShieldLockIcon,
  LockIcon,
  RefreshIcon,
} from '@/components/brand/icons'

export default async function AdminPage() {
  const { profile } = await getUserContext()

  const cards = [
    {
      href: '/admin/users',
      title: 'Users',
      description: 'Manage your team members and their roles.',
      icon: UsersIcon,
    },
    {
      href: '/admin/lawyers',
      title: 'Lawyers',
      description: 'Manage lawyers, categories and billing rates.',
      icon: BriefcaseIcon,
    },
    {
      href: '/admin/accounts-staff',
      title: 'Accounts Staff',
      description: 'Manage accounts-role staff and their tiers.',
      icon: CalculatorIcon,
    },
    {
      href: '/admin/matters',
      title: 'New Matter',
      description: 'Open a new matter for an existing or new client.',
      icon: FilePlusIcon,
    },
    {
      href: '/admin/clients',
      title: 'Clients',
      description: 'Manage clients your organization works with.',
      icon: BuildingIcon,
    },
    {
      href: '/admin/import',
      title: 'Import Data',
      description: 'Bulk import clients or employees from a CSV file.',
      icon: FileUploadIcon,
    },
    {
      href: '/admin/billing/pricing',
      title: 'Billing & Pricing',
      description: 'View plan pricing and estimate costs.',
      icon: CreditCardIcon,
    },
    {
      href: '/admin/backup',
      title: 'Backup & Restore',
      description: 'Download a full data backup, or restore one into a new organization.',
      icon: RefreshIcon,
    },
    {
      href: '/admin/security-log',
      title: 'Security Log',
      description: 'Login attempts, logouts, password resets, and user management actions.',
      icon: ShieldLockIcon,
    },
    {
      href: '/admin/security-settings',
      title: 'Security Settings',
      description: 'Require multi-factor authentication for everyone in your organization.',
      icon: LockIcon,
    },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin</h1>
      <p className="text-gray-600 mb-8">
        Manage your organization, team, and billing.
        {profile?.role !== 'owner' && profile?.role !== 'admin' && (
          <span className="text-amber-600"> Some actions may require admin access.</span>
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white border border-gray-200 rounded-lg p-5 hover:border-blue-300 hover:shadow-sm transition"
          >
            <card.icon className="w-6 h-6 text-gray-600" />
            <p className="font-semibold text-gray-900 mt-3">{card.title}</p>
            <p className="text-sm text-gray-500 mt-1">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
