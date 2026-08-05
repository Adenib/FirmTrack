import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class ExchangeRateError extends Error {}

// Returns the tenant's rate for fromCurrency -> toCurrency as of a
// given date (the latest accounttrack_exchange_rates row with
// effective_date <= asOfDate). Same-currency is always 1, no lookup.
// Falls back to the inverse pair (1/rate) if only that direction was
// ever recorded -- an admin only needs to enter a pair once. Throws
// (never silently assumes 1:1) if no rate exists for either direction
// -- posting a foreign-currency transaction with a guessed rate would
// silently corrupt real accounting data.
export async function getExchangeRate(
  tenantId: string,
  fromCurrency: string,
  toCurrency: string,
  asOfDate: string
): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  const { data: direct } = await supabaseAdmin
    .from('accounttrack_exchange_rates')
    .select('rate')
    .eq('tenant_id', tenantId)
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .lte('effective_date', asOfDate)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (direct) return Number(direct.rate)

  const { data: inverse } = await supabaseAdmin
    .from('accounttrack_exchange_rates')
    .select('rate')
    .eq('tenant_id', tenantId)
    .eq('from_currency', toCurrency)
    .eq('to_currency', fromCurrency)
    .lte('effective_date', asOfDate)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (inverse) return 1 / Number(inverse.rate)

  throw new ExchangeRateError(
    `No ${fromCurrency} → ${toCurrency} exchange rate set for this tenant as of ${asOfDate} -- add one in AccountTrack → Currencies before posting this transaction`
  )
}
