import { MARKETING_MODULES } from './modules'
import { TIER_PRICES, ADDON_PRICE_BASIC } from '@/lib/billing/pricing'

export type FaqEntry = {
  id: string
  question: string
  keywords: string[]
  answer: string
}

// One entry per module, generated from MARKETING_MODULES rather than
// hand-duplicated -- stays in sync automatically as modules are added or
// their feature lists change.
const MODULE_ENTRIES: FaqEntry[] = MARKETING_MODULES.map((mod) => ({
  id: `module-${mod.slug}`,
  question: `What does ${mod.title} do?`,
  keywords: [mod.slug, mod.title.toLowerCase()],
  answer: `${mod.tagline} ${mod.features.slice(0, 3).join('. ')}.`,
}))

// Computed from the real pricing data (src/lib/billing/pricing.ts), never
// a hardcoded number that could drift from the actual pricing calculator.
const PRICING_ENTRY: FaqEntry = {
  id: 'pricing',
  question: 'How much does FirmTrack cost?',
  keywords: ['price', 'pricing', 'cost', 'plan', 'plans', 'tier', 'subscription'],
  answer:
    `FirmTrack has three tiers: Basic (from ₦${TIER_PRICES.basic.toLocaleString()}/user/month, ` +
    `with AccountTrack, DocTrack, HRTrack, and AI Support available as ₦${ADDON_PRICE_BASIC.toLocaleString()}/user/month add-ons), ` +
    `Standard (₦${TIER_PRICES.standard.toLocaleString()}/user/month, every module included), and ` +
    `Elite (₦${TIER_PRICES.elite.toLocaleString()}/user/month, every module included). ` +
    `Several modules are free to start with. The best way to see an exact number for your firm is the "Get started free" button below, or book a demo.`,
}

const SECURITY_ENTRY: FaqEntry = {
  id: 'security',
  question: 'Is FirmTrack secure?',
  keywords: ['security', 'secure', 'safe', 'mfa', 'encryption', 'data', 'privacy'],
  answer:
    'Yes -- multi-factor authentication, full security audit logging, the ability to sign out every device at once, encryption in transit, and strict tenant data isolation between firms. See our Security Guaranty for the full detail.',
}

const GETTING_STARTED_ENTRY: FaqEntry = {
  id: 'getting-started',
  question: 'How do I get started?',
  keywords: ['start', 'trial', 'sign up', 'signup', 'register', 'demo', 'begin'],
  answer:
    'Click "Get started free" to create your firm\'s account in minutes -- no credit card required for the free modules. If you\'d rather see it walked through first, click "Book a demo" and we\'ll set up time with you.',
}

const SUPPORT_ENTRY: FaqEntry = {
  id: 'support',
  question: 'What if I need help after signing up?',
  keywords: ['support', 'help', 'contact', 'assistance'],
  answer:
    'Every plan includes support via support@firmtracks.com with a reply within 24 hours. Once you\'re signed in, you can also open a support request directly from the app.',
}

export const FAQ_ENTRIES: FaqEntry[] = [
  GETTING_STARTED_ENTRY,
  PRICING_ENTRY,
  ...MODULE_ENTRIES,
  SECURITY_ENTRY,
  SUPPORT_ENTRY,
]

// Plain substring matching against each entry's keywords/question --
// intentionally not AI/NLP, so this has zero per-query cost and nothing to
// prompt-inject. Returns the first match; null means "show the fallback".
export function matchFaqEntry(query: string): FaqEntry | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return (
    FAQ_ENTRIES.find(
      (entry) =>
        entry.keywords.some((k) => q.includes(k)) || entry.question.toLowerCase().includes(q)
    ) || null
  )
}
