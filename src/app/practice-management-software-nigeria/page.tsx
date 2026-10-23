import Link from 'next/link'
import Logo from '@/components/brand/logo'
import {
  ShieldLockIcon,
  FileCheckIcon,
  RefreshIcon,
  BuildingIcon,
} from '@/components/brand/icons'
import { MARKETING_MODULES } from '@/lib/marketing/modules'
import FaqChatWidget from '@/components/marketing/faq-chat-widget'

export const metadata = {
  title: 'Legal Practice Management Software in Nigeria | FirmTrack',
  description:
    'FirmTrack is legal practice management software built for Nigerian law firms -- Naira billing with Paystack, multi-currency for international clients, trust accounting, payroll, and secure documents in one platform.',
}

const LOCAL_POINTS = [
  {
    title: 'Bill in Naira, by default',
    body: 'Every invoice, rate, and report works in NGN out of the box -- no workaround spreadsheets, no manual currency conversion for everyday billing.',
  },
  {
    title: 'Paystack built in',
    body: 'Subscription billing and client payment links run through Paystack, the payment processor Nigerian businesses and their clients already trust and use daily.',
  },
  {
    title: 'Multi-currency when you need it',
    body: 'Firms with international clients can bill in dollars or other currencies alongside Naira, with real exchange rates and FX gain/loss tracked automatically -- not bolted on as an afterthought.',
  },
  {
    title: 'Built around Nigerian trust accounting practice',
    body: "Matter-scoped trust and retainer ledgers, a three-way reconciliation against your actual bank statement, and a full audit trail -- the record-keeping a bar association audit actually expects.",
  },
  {
    title: 'Works for hybrid and remote teams',
    body: 'GPS-verified attendance, a WFH presence check-in, and an optional desktop agent for automatic time capture -- built for how Nigerian firms actually staff and work today.',
  },
  {
    title: 'Your data, never locked in',
    body: 'A full backup is one click away at any time, and restoring into a brand-new organization is built in -- not a support ticket and a wait.',
  },
]

export default function PracticeManagementSoftwareNigeriaPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/"><Logo size="sm" /></Link>
          <nav className="flex items-center gap-4">
            <Link href="/blog" className="text-sm font-medium text-gray-700 hover:text-brand-blue">Blog</Link>
            <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-brand-blue">Log in</Link>
            <Link href="/register" className="text-sm font-medium bg-brand-blue text-white px-4 py-2 rounded-md hover:bg-brand-blue-hover">Get started</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-brand-gradient text-white">
          <div className="max-w-5xl mx-auto px-6 py-16 sm:py-24 text-center">
            <p className="text-sm font-medium text-blue-200 mb-4 tracking-wide uppercase">
              Legal practice management software, built for Nigeria
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
              Practice Management Software<br />
              <span className="text-blue-300">Built for Nigerian Law Firms</span>
            </h1>
            <p className="text-lg text-blue-100 max-w-2xl mx-auto mb-8">
              Naira billing, Paystack payments, trust accounting that matches how Nigerian firms actually
              operate -- and multi-currency support the moment a client isn't local. One platform, not five
              disconnected tools.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/register" className="bg-white text-brand-blue font-semibold px-6 py-3 rounded-md hover:bg-blue-50">
                Get started free
              </Link>
              <a href="mailto:demo@firmtracks.com?subject=Book%20a%20FirmTrack%20demo" className="border border-white/60 text-white font-semibold px-6 py-3 rounded-md hover:bg-white/10">
                Book a demo
              </a>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Built for how Nigerian firms actually work</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Most legal practice management software is built for US or UK firms first, with everything else
            an afterthought. FirmTrack starts from a different assumption.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {LOCAL_POINTS.map((point) => (
              <div key={point.title} className="border border-gray-200 rounded-lg p-6">
                <p className="font-semibold text-gray-900 mb-2">{point.title}</p>
                <p className="text-sm text-gray-600">{point.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 border-y border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Every module your firm needs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {MARKETING_MODULES.map((mod) => (
                <Link
                  key={mod.slug}
                  href={`/modules/${mod.slug}`}
                  className="block bg-white border border-gray-200 rounded-lg p-6 hover:border-brand-blue/40 hover:shadow-sm transition"
                >
                  <div className="w-11 h-11 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center mb-4">
                    <mod.icon className="w-6 h-6" />
                  </div>
                  <p className="font-semibold text-gray-900 mb-1">{mod.title}</p>
                  <p className="text-sm text-gray-600">{mod.tagline}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {[
              { icon: ShieldLockIcon, label: 'Multi-factor authentication' },
              { icon: FileCheckIcon, label: 'Security audit logging' },
              { icon: RefreshIcon, label: 'Full backup & restore' },
              { icon: BuildingIcon, label: 'Tenant data isolation' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-gray-700">
                <item.icon className="w-5 h-5 text-brand-blue" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Questions Nigerian firms ask first</h2>
          <div className="space-y-6">
            <div>
              <p className="font-semibold text-gray-900 mb-1">Does FirmTrack bill in Naira?</p>
              <p className="text-sm text-gray-600">Yes -- Naira is the default currency for rates, invoices, and reports. Subscription and client payments run through Paystack.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Can we bill international clients in dollars?</p>
              <p className="text-sm text-gray-600">Yes -- AccountTrack supports multiple currencies alongside your Naira base currency, with real exchange rates and FX gain/loss tracked automatically.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Does it handle trust accounting the way a bar audit expects?</p>
              <p className="text-sm text-gray-600">Matter-scoped trust and retainer ledgers, a bank reconciliation report, and a full audit trail -- the three-way check an audit actually looks for.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Where is our data stored?</p>
              <p className="text-sm text-gray-600">Securely in the cloud, isolated per firm, with encryption in transit, MFA enforcement, and a one-click full backup you can download at any time.</p>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to run your firm on FirmTrack?</h2>
          <Link href="/register" className="inline-block bg-brand-blue text-white font-semibold px-8 py-3 rounded-md hover:bg-brand-blue-hover">
            Create your account
          </Link>
        </section>
      </main>

      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} FirmTrack. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/legal/terms-of-service" className="hover:text-brand-blue">Terms</Link>
            <Link href="/legal/privacy-policy" className="hover:text-brand-blue">Privacy</Link>
            <Link href="/legal" className="hover:text-brand-blue">All legal documents</Link>
          </div>
        </div>
      </footer>

      <FaqChatWidget />
    </div>
  )
}
