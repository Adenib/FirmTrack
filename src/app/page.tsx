import Image from 'next/image'
import Link from 'next/link'
import Logo from '@/components/brand/logo'
import {
  ShieldLockIcon,
  FileCheckIcon,
  RefreshIcon,
  LockIcon,
  BuildingIcon,
} from '@/components/brand/icons'
import { MARKETING_MODULES } from '@/lib/marketing/modules'

const TRUST_ITEMS = [
  { icon: ShieldLockIcon, label: 'Multi-factor authentication' },
  { icon: FileCheckIcon, label: 'Security audit logging' },
  { icon: RefreshIcon, label: 'Sign out everywhere' },
  { icon: LockIcon, label: 'Encrypted in transit' },
  { icon: BuildingIcon, label: 'Tenant data isolation' },
]

const KEY_BENEFITS = [
  'Matter management',
  'Time tracking',
  'Billing & invoicing',
  'Trust accounting',
  'Payroll',
  'Secure document management',
  'Reports & analytics',
]

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-brand-blue">
              Log in
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-brand-blue text-white px-4 py-2 rounded-md hover:bg-brand-blue-hover"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-brand-gradient text-white">
        <div className="max-w-6xl mx-auto px-6 py-14 sm:py-24 text-center">
          <p className="text-sm font-medium text-blue-200 mb-4 tracking-wide uppercase">
            Practice management for modern law firms
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            Track Performance,<br />
            <span className="text-blue-300">Grow Your Firm</span>
          </h1>
          <p className="text-lg text-blue-100 max-w-2xl mx-auto mb-8">
            Manage matters, billable time, billing, accounting, HR, payroll, documents, and client
            relationships — all from one secure cloud platform.
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-10 max-w-3xl mx-auto">
            {KEY_BENEFITS.map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-sm text-blue-100">
                <span className="text-green-300 font-semibold">&#10003;</span>
                {item}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="bg-white text-brand-blue font-semibold px-6 py-3 rounded-md hover:bg-blue-50"
            >
              Get started free
            </Link>
            <a
              href="mailto:demo@firmtracks.com?subject=Book%20a%20FirmTrack%20demo"
              className="border border-white/60 text-white font-semibold px-6 py-3 rounded-md hover:bg-white/10"
            >
              Book a demo
            </a>
            <Link
              href="/login"
              className="border border-white/60 text-white font-semibold px-6 py-3 rounded-md hover:bg-white/10"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
          <div className="rounded-lg border border-gray-200 shadow-lg overflow-hidden max-w-2xl w-full">
            <Image
              src="/marketing/screenshot-desktop.png"
              alt="FirmTrack TimeTrack overview on desktop"
              width={1440}
              height={900}
              priority
              className="w-full h-auto"
            />
          </div>
          <div className="rounded-lg border border-gray-200 shadow-lg overflow-hidden max-w-[220px] w-full shrink-0">
            <Image
              src="/marketing/screenshot-mobile.png"
              alt="FirmTrack HRTrack attendance on mobile"
              width={390}
              height={844}
              priority
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Everything your firm needs</h2>
        <p className="text-gray-600 text-center mb-12">One subscription, every module you need to run your practice.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MARKETING_MODULES.map((mod) => (
            <Link
              key={mod.slug}
              href={`/modules/${mod.slug}`}
              className="block border border-gray-200 rounded-lg p-6 hover:border-brand-blue/40 hover:shadow-sm transition"
            >
              <div className="w-11 h-11 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center mb-4">
                <mod.icon className="w-6 h-6" />
              </div>
              <p className="font-semibold text-gray-900 mb-1">{mod.title}</p>
              <p className="text-sm text-gray-600">{mod.tagline}</p>
              <span className="text-sm text-brand-blue font-medium mt-3 inline-block">See features &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Built with security in mind</h2>
          <p className="text-gray-600 text-center mb-10">
            Real safeguards, not just a promise —{' '}
            <Link href="/terms" className="text-brand-blue hover:underline">
              see our Security Guaranty
            </Link>
            .
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {TRUST_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-gray-700">
                <item.icon className="w-5 h-5 text-brand-blue" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to get started?</h2>
        <Link
          href="/register"
          className="inline-block bg-brand-blue text-white font-semibold px-8 py-3 rounded-md hover:bg-brand-blue-hover"
        >
          Create your account
        </Link>
      </section>

      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} FirmTrack. All rights reserved.</p>
          <Link href="/terms" className="hover:text-brand-blue">
            User Agreement
          </Link>
        </div>
      </footer>
    </div>
  )
}
