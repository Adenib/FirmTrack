import Link from 'next/link'
import { notFound } from 'next/navigation'
import Logo from '@/components/brand/logo'
import { MARKETING_MODULES, getMarketingModule } from '@/lib/marketing/modules'

export function generateStaticParams() {
  return MARKETING_MODULES.map((m) => ({ slug: m.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const mod = getMarketingModule(slug)
  return { title: mod ? `${mod.title} — FirmTrack` : 'FirmTrack' }
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const mod = getMarketingModule(slug)
  if (!mod) notFound()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo size="sm" />
          </Link>
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
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <mod.icon className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold mb-4">{mod.title}</h1>
          <p className="text-lg text-blue-100 max-w-xl mx-auto">{mod.tagline}</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 w-full">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Key features</h2>
        <ul className="space-y-4">
          {mod.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <span className="text-green-500 font-semibold mt-0.5">&#10003;</span>
              <span className="text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Ready to bring {mod.title} to your firm?
          </h2>
          <p className="text-gray-600 mb-8">
            {mod.title} comes with every FirmTrack subscription — set up your firm and start using
            it today.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="bg-brand-blue text-white font-semibold px-6 py-3 rounded-md hover:bg-brand-blue-hover"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="border border-gray-300 text-gray-700 font-semibold px-6 py-3 rounded-md hover:bg-gray-100"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12 text-center">
        <Link href="/" className="text-sm text-brand-blue hover:underline">
          &larr; Back to all modules
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
