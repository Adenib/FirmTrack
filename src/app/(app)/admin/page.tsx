import Link from 'next/link'
import { getUserContext } from '@/lib/get-user-context'

export default async function AdminPage() {
  const { profile } = await getUserContext()

  const cards = [
    {
      href: '/admin/users',
      title: 'Users',
      description: 'Manage your team members and their roles.',
      icon: 'ti-users',
    },
    {
      href: '/admin/lawyers',
      title: 'Lawyers',
      description: 'Manage lawyers, categories and billing rates.',
      icon: 'ti-briefcase',
    },
    {
      href: '/admin/accounts-staff',
      title: 'Accounts Staff',
      description: 'Manage accounts-role staff and their tiers.',
      icon: 'ti-calculator',
    },
    {
      href: '/admin/matters',
      title: 'New Matter',
      description: 'Open a new matter for an existing or new client.',
      icon: 'ti-file-plus',
    },
    {
      href: '/admin/clients',
      title: 'Clients',
      description: 'Manage clients your organization works with.',
      icon: 'ti-building',
    },
    {
      href: '/admin/import',
      title: 'Import Data',
      description: 'Bulk import clients or employees from a CSV file.',
      icon: 'ti-file-upload',
    },
    {
      href: '/admin/billing/pricing',
      title: 'Billing & Pricing',
      description: 'View plan pricing and estimate costs.',
      icon: 'ti-credit-card',
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
            <i className={`ti ${card.icon}`} style={{ fontSize: 22, color: '#4b5563' }} />
            <p className="font-semibold text-gray-900 mt-3">{card.title}</p>
            <p className="text-sm text-gray-500 mt-1">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
