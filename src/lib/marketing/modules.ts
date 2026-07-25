import {
  ClockIcon,
  ReceiptIcon,
  ChartBarIcon,
  UsersIcon,
  CalendarIcon,
  SettingsIcon,
  FileCheckIcon,
} from '@/components/brand/icons'

export type MarketingModule = {
  slug: string
  title: string
  tagline: string
  icon: React.ComponentType<{ className?: string }>
  features: string[]
}

// Slugs match the sidebar's own module keys (src/app/(app)/layout.tsx) --
// one shared vocabulary for "which module is this" across the marketing
// site and the app itself.
export const MARKETING_MODULES: MarketingModule[] = [
  {
    slug: 'timetrack',
    title: 'TimeTrack',
    tagline: 'Every billable minute, captured without the busywork.',
    icon: ClockIcon,
    features: [
      'Log billable and non-billable time against any matter',
      'Quick Fee entry for fast, simple time capture',
      'Firmwide activity log and reporting',
      'Desktop agent integration for automatic activity tracking',
    ],
  },
  {
    slug: 'billtrack',
    title: 'BillTrack',
    tagline: 'Turn tracked time into invoices your clients actually pay.',
    icon: ReceiptIcon,
    features: [
      'Turn unbilled time and disbursements into itemized invoices',
      'Automated payment reminders with a configurable cadence',
      'Pause or resume reminders on a per-invoice basis',
      'Firmwide billing reports and outstanding balances',
    ],
  },
  {
    slug: 'accounttrack',
    title: 'AccountTrack',
    tagline: 'Real double-entry accounting, built for legal practice.',
    icon: ChartBarIcon,
    features: [
      'Full chart of accounts and double-entry journal postings',
      'Trust and retainer ledgers with running balances',
      'Budgets for lawyers and matters',
      'Accounting period close/reopen controls',
      'Financial statements at a glance',
    ],
  },
  {
    slug: 'doctrack',
    title: 'DocTrack',
    tagline: 'Matter-linked document storage your firm can trust.',
    icon: FileCheckIcon,
    features: [
      'Matter-linked document storage with full version history',
      'A complete audit trail of every document action',
      'Link files directly from OneDrive, Outlook, and SharePoint -- no duplicate copies',
      'Configurable document retention policies',
      'Role-based access down to the matter level',
    ],
  },
  {
    slug: 'hrtrack',
    title: 'HRTrack',
    tagline: 'Attendance, leave, performance, and payroll in one place.',
    icon: UsersIcon,
    features: [
      'Clock in/out attendance with GPS-verified office/remote tagging',
      'Leave, redeployment, grievance, and exit requests with an approval workflow',
      'Performance evaluations',
      'Payroll runs with automatic payslip generation',
    ],
  },
  {
    slug: 'calentrack',
    title: 'CalenTrack',
    tagline: 'A shared firm calendar so nothing falls through the cracks.',
    icon: CalendarIcon,
    features: [
      'Shared firmwide calendar for deadlines and appointments',
      'Events linked to matters and time entries',
      'Calendar reporting',
    ],
  },
  {
    slug: 'admin',
    title: 'Admin',
    tagline: 'Full control over your firm, its people, and its security.',
    icon: SettingsIcon,
    features: [
      'Manage users, roles, and permissions',
      'Manage lawyers, categories, and billing rates',
      'Client and matter management with conflict-of-interest checks',
      'Bulk data import',
      'Security audit log and multi-factor authentication enforcement',
      'Full data backup, and restore into a new organization',
    ],
  },
]

export function getMarketingModule(slug: string): MarketingModule | undefined {
  return MARKETING_MODULES.find((m) => m.slug === slug)
}
