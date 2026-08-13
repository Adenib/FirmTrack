import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { getPricingTable } from '@/lib/billing/get-pricing-table'
import { moduleMonthlyPriceFromTable, type ModuleKey, type Tier } from '@/lib/billing/pricing'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'organizations')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { orgId, module, is_active, tier, price_per_user } = await request.json()

  // Check if subscription row exists
  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('id, tier')
    .eq('tenant_id', orgId)
    .eq('module', module)
    .single()

  if (existing) {
    const updates: Record<string, unknown> = {}
    if (is_active !== undefined) updates.is_active = is_active

    if (price_per_user !== undefined) {
      // Explicit manual override -- independent of tier, always wins over
      // a tier-driven recompute when both are somehow sent together.
      updates.price_per_user = Number(price_per_user)
    } else if (tier !== undefined && tier !== existing.tier) {
      // An explicit tier change means "use the standard price for this
      // tier" -- recomputes from the live pricing table, clearing
      // whatever override was previously set on this row.
      const priceTable = await getPricingTable('NGN')
      updates.tier = tier
      updates.price_per_user = moduleMonthlyPriceFromTable(tier as Tier, module as ModuleKey, priceTable)
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update(updates)
        .eq('tenant_id', orgId)
        .eq('module', module)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const resolvedTier = tier || 'basic'
    let resolvedPrice = 0
    if (price_per_user !== undefined) {
      resolvedPrice = Number(price_per_user)
    } else {
      const priceTable = await getPricingTable('NGN')
      resolvedPrice = moduleMonthlyPriceFromTable(resolvedTier as Tier, module as ModuleKey, priceTable)
    }

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        tenant_id: orgId,
        module,
        tier: resolvedTier,
        is_active: true,
        price_per_user: resolvedPrice,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}