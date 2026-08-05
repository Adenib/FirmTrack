// Static calling-code -> default currency mapping, used only to pick a
// sensible default for a new organization's base_currency at signup. Not
// exhaustive, not authoritative -- an admin can correct it afterward
// (subject to whatever immutability rule applies once the tenant has
// posted transactions). No external API involved.
const CALLING_CODE_CURRENCY: Array<{ prefix: string; currency: string }> = [
  { prefix: '+234', currency: 'NGN' }, // Nigeria -- this codebase's primary market
  { prefix: '+233', currency: 'GHS' }, // Ghana
  { prefix: '+254', currency: 'KES' }, // Kenya
  { prefix: '+27', currency: 'ZAR' }, // South Africa
  { prefix: '+20', currency: 'EGP' }, // Egypt
  { prefix: '+353', currency: 'EUR' }, // Ireland
  { prefix: '+49', currency: 'EUR' }, // Germany
  { prefix: '+33', currency: 'EUR' }, // France
  { prefix: '+34', currency: 'EUR' }, // Spain
  { prefix: '+39', currency: 'EUR' }, // Italy
  { prefix: '+44', currency: 'GBP' }, // UK
  { prefix: '+91', currency: 'INR' }, // India
  { prefix: '+971', currency: 'AED' }, // UAE
  { prefix: '+61', currency: 'AUD' }, // Australia
  { prefix: '+1', currency: 'USD' }, // US/Canada (+ Caribbean NANP, approximated)
]

// Sorted longest-prefix-first so e.g. +233 matches before a hypothetical
// shorter overlapping prefix would.
const SORTED = [...CALLING_CODE_CURRENCY].sort((a, b) => b.prefix.length - a.prefix.length)

export function currencyForPhone(phone: string | null | undefined, fallback = 'NGN'): string {
  if (!phone) return fallback
  const normalized = phone.trim().replace(/[\s()-]/g, '')
  const withPlus = normalized.startsWith('+') ? normalized : `+${normalized.replace(/^00/, '')}`
  const match = SORTED.find((entry) => withPlus.startsWith(entry.prefix))
  return match?.currency ?? fallback
}
