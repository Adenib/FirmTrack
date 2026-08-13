import { createClient } from '@supabase/supabase-js'
import type { PriceTable, ModuleKey, Tier } from './pricing'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Reads the live standard pricing table (platform_module_pricing),
// editable via the Creator Console. Server-side only (service-role
// client) -- client components fetch it through GET /api/billing/pricing
// instead of importing this directly.
export async function getPricingTable(currency = 'NGN'): Promise<PriceTable> {
  const { data } = await supabaseAdmin
    .from('platform_module_pricing')
    .select('module, tier, price')
    .eq('currency', currency)

  const table: PriceTable = {}
  for (const row of data || []) {
    const moduleKey = row.module as ModuleKey
    const tier = row.tier as Tier
    if (!table[moduleKey]) table[moduleKey] = {}
    table[moduleKey]![tier] = Number(row.price)
  }
  return table
}
