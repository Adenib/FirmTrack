import { TIER_PRICES } from '@/lib/billing/pricing'
import { FAQ_ENTRIES } from '@/lib/marketing/faq'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// schema.org JSON-LD builders for the homepage. Kept as plain object
// builders (not components) since the only thing that renders them is a
// single <script type="application/ld+json"> tag -- no markup of their
// own.

// No street address is published here -- areaServed signals who FirmTrack
// is for without asserting a physical location we haven't verified.
// Upgrade to a real LocalBusiness/address once one is confirmed.
export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FirmTrack',
    url: BASE_URL,
    logo: `${BASE_URL}/brand/icon-mark.png`,
    areaServed: { '@type': 'Country', name: 'Nigeria' },
  }
}

export function buildSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FirmTrack',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: BASE_URL,
    description:
      'Legal practice management software for law firms in Nigeria and beyond -- matters, billable time, billing, trust accounting, HR, payroll, and secure documents in one platform.',
    areaServed: { '@type': 'Country', name: 'Nigeria' },
    offers: [
      { '@type': 'Offer', name: 'Basic', priceCurrency: 'NGN', price: TIER_PRICES.basic },
      { '@type': 'Offer', name: 'Standard', priceCurrency: 'NGN', price: TIER_PRICES.standard },
      { '@type': 'Offer', name: 'Elite', priceCurrency: 'NGN', price: TIER_PRICES.elite },
    ],
  }
}

// Mirrors the FAQ widget's own content exactly -- never maintained as a
// separate copy that could drift from what visitors actually see.
export function buildFaqPageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  }
}
