import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns the fields to spread onto a journal line posted against
// accountKey, tagging it with its native-currency amount -- but only when
// that account is marked as genuinely foreign-currency
// (chart_of_accounts.currency set) AND matches the transaction's own
// currency (the common case -- paying a USD bill from a USD account).
// Cross-currency cash moves (e.g. a EUR bill paid from a USD account) are
// intentionally left untagged -- not tracked at the foreign-balance level
// in this phase. Returns {} (no tag) for the overwhelming majority of
// transactions, which post against base-currency accounts.
export async function tagOriginalAmount(
  tenantId: string,
  accountKey: string,
  transactionCurrency: string,
  transactionAmount: number
): Promise<{ originalCurrency?: string; originalAmount?: number }> {
  const { data: account } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('currency')
    .eq('tenant_id', tenantId)
    .eq('key', accountKey)
    .maybeSingle()

  if (account?.currency && account.currency === transactionCurrency) {
    return { originalCurrency: transactionCurrency, originalAmount: transactionAmount }
  }
  return {}
}

// Same as tagOriginalAmount but by raw account id -- needed for a custom
// cash account (e.g. "Petty Cash - Lagos"), which has no `key`.
export async function tagOriginalAmountById(
  tenantId: string,
  accountId: string,
  transactionCurrency: string,
  transactionAmount: number
): Promise<{ originalCurrency?: string; originalAmount?: number }> {
  const { data: account } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('currency')
    .eq('tenant_id', tenantId)
    .eq('id', accountId)
    .maybeSingle()

  if (account?.currency && account.currency === transactionCurrency) {
    return { originalCurrency: transactionCurrency, originalAmount: transactionAmount }
  }
  return {}
}
