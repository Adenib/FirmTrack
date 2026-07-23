import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_ORDER = { free: 0, basic: 1, standard: 2, elite: 3 }

// Shared by /api/payments/verify and the Paystack webhook -- both need to
// turn one successful Paystack transaction into subscriptions rows, one
// per module in the bundle (a single-module purchase is just a bundle of
// one). The org's plan is bumped at most once, not per module.
export async function activateSubscriptions(params: {
  tenantId: string
  tier: string
  modulePrices: Record<string, number>
  paystackSubscriptionCode?: string | null
}) {
  const now = new Date()
  const nextMonth = new Date(now)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  for (const [module, pricePerUser] of Object.entries(params.modulePrices)) {
    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('module', module)
      .single()

    const row = {
      tier: params.tier,
      is_active: true,
      price_per_user: pricePerUser,
      billing_cycle_start: now.toISOString(),
      billing_cycle_end: nextMonth.toISOString(),
      paystack_subscription_code: params.paystackSubscriptionCode || null,
    }

    if (existing) {
      await supabaseAdmin.from('subscriptions').update(row).eq('tenant_id', params.tenantId).eq('module', module)
    } else {
      await supabaseAdmin.from('subscriptions').insert({ tenant_id: params.tenantId, module, ...row })
    }
  }

  const { data: org } = await supabaseAdmin.from('organizations').select('plan').eq('id', params.tenantId).single()
  const tierOrder = TIER_ORDER as Record<string, number>
  if (org && tierOrder[params.tier] > tierOrder[org.plan]) {
    await supabaseAdmin.from('organizations').update({ plan: params.tier }).eq('id', params.tenantId)
  }
}
