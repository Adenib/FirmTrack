import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { getPricingTable } from '@/lib/billing/get-pricing-table'
import { MODULES, moduleMonthlyPriceFromTable, type ModuleKey, type Tier } from '@/lib/billing/pricing'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Applies a discount percentage across every one of an org's currently
// active module subscriptions -- only when EVERY module is active (the
// "all modules" bundle the rebate is meant for). DB-only, same as any
// other per-org price override: a per-org discount can't safely reach
// into Paystack, since the recurring-charge plan a module/tier is
// attached to is shared across every org on it -- discounting the shared
// plan would silently discount everyone else on it too.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'pricing')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { orgId, discountPercent } = await request.json()
  const pct = Number(discountPercent)
  if (!orgId || isNaN(pct) || pct <= 0 || pct >= 100) {
    return NextResponse.json({ error: 'orgId and a discountPercent between 0 and 100 are required' }, { status: 400 })
  }

  const { data: subs, error: subsError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, module, tier, is_active')
    .eq('tenant_id', orgId)

  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 500 })

  const activeModules = new Set((subs || []).filter((s) => s.is_active).map((s) => s.module))
  const allModulesActive = MODULES.every((m) => activeModules.has(m.key))

  if (!allModulesActive) {
    return NextResponse.json(
      { error: 'This organization does not have every module active -- the bundle rebate only applies when all modules are enabled' },
      { status: 400 }
    )
  }

  const priceTable = await getPricingTable('NGN')
  const updated: { module: string; price: number }[] = []

  for (const sub of subs || []) {
    if (!sub.is_active) continue
    const standardPrice = moduleMonthlyPriceFromTable(sub.tier as Tier, sub.module as ModuleKey, priceTable)
    const discountedPrice = Math.round(standardPrice * (1 - pct / 100))
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ price_per_user: discountedPrice })
      .eq('id', sub.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    updated.push({ module: sub.module, price: discountedPrice })
  }

  return NextResponse.json({ success: true, discountPercent: pct, updated })
}
