import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ResolvedCostRate = { rate: number; currency: string }

// Resolves the internal cost rate for a lawyer's time as of a given date:
// the lawyer's own most-recently-effective rate, falling back to their
// category/grade's rate as of the same date. Returns null (not a throw)
// when neither is configured -- this runs inline in ordinary time-entry
// creation, and a tenant that hasn't set up Profitability yet must still
// be able to log time. Downstream, a null internal_cost_amount surfaces as
// `missingCostRateEntryCount` on the profitability report rather than
// silently costing the time at 0.
export async function resolveInternalCostRate(
  tenantId: string,
  lawyerId: string,
  asOfDate: string
): Promise<ResolvedCostRate | null> {
  const { data: lawyerRate } = await supabaseAdmin
    .from('internal_cost_rates')
    .select('rate, currency')
    .eq('tenant_id', tenantId)
    .eq('lawyer_id', lawyerId)
    .lte('effective_from', asOfDate)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lawyerRate) return { rate: Number(lawyerRate.rate), currency: lawyerRate.currency }

  const { data: lawyer } = await supabaseAdmin
    .from('lawyers')
    .select('category_id')
    .eq('id', lawyerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!lawyer?.category_id) return null

  const { data: categoryRate } = await supabaseAdmin
    .from('internal_cost_rates')
    .select('rate, currency')
    .eq('tenant_id', tenantId)
    .eq('category_id', lawyer.category_id)
    .lte('effective_from', asOfDate)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!categoryRate) return null
  return { rate: Number(categoryRate.rate), currency: categoryRate.currency }
}
