export type Tier = 'basic' | 'standard' | 'elite'

export const MODULES = [
  { key: 'timetrack', label: 'TimeTrack', free: true },
  { key: 'movementtrack', label: 'MovementTrack', free: true },
  { key: 'tasktrack', label: 'TaskTrack', free: true },
  { key: 'billtrack', label: 'BillTrack', free: true },
  { key: 'accounttrack', label: 'AccountTrack', free: false },
  { key: 'doctrack', label: 'DocTrack', free: false },
  { key: 'hrtrack', label: 'HRTrack', free: false },
  { key: 'ai_support', label: 'AI Support Assistant', free: false },
] as const

export type ModuleKey = (typeof MODULES)[number]['key']

export const TIER_PRICES: Record<Tier, number> = {
  basic: 1500,
  standard: 2500,
  elite: 4000,
}

export const ADDON_PRICE_BASIC = 2000

// Same per-module logic the pricing calculator displays -- kept here so
// the bundle checkout charges exactly what's shown, never a separately
// computed number. On Basic, "core" modules are the flat Basic rate and
// the three add-on modules cost more; Standard/Elite are a flat
// per-module rate regardless of the free/add-on distinction.
export function moduleMonthlyPrice(tier: Tier, mod: { free: boolean }): number {
  if (tier === 'basic') return mod.free ? TIER_PRICES.basic : ADDON_PRICE_BASIC
  return TIER_PRICES[tier]
}

export function isModuleKey(key: string): key is ModuleKey {
  return MODULES.some((m) => m.key === key)
}

// Live, editable pricing (Creator Console -> /creator/pricing, table
// platform_module_pricing) -- module key -> tier -> price. Used by every
// consumer where "what's charged" must be exact: checkout
// (payments/initialize) and the pricing calculator. TIER_PRICES/
// ADDON_PRICE_BASIC above stay as the frozen seed values for that table's
// migration and for illustrative marketing copy (the FAQ widget, the
// Support Assistant upsell) that doesn't need to track live price
// changes precisely.
export type PriceTable = Partial<Record<ModuleKey, Partial<Record<Tier, number>>>>

export function moduleMonthlyPriceFromTable(tier: Tier, moduleKey: ModuleKey, priceTable: PriceTable): number {
  return priceTable[moduleKey]?.[tier] ?? 0
}
