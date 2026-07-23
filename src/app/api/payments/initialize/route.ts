import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { MODULES, isModuleKey, moduleMonthlyPrice, type Tier } from '@/lib/billing/pricing'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 403 })

  const { module, modules, tier, currency = 'NGN' } = await request.json()

  if (!tier) {
    return NextResponse.json({ error: 'tier is required' }, { status: 400 })
  }

  // Real active seat count -- never the client's own estimate (e.g. a
  // pricing-calculator slider), for either checkout shape below.
  const { data: orgUsers } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
  const seatCount = orgUsers?.length || 1

  let totalAmount: number
  let metadata: Record<string, unknown>
  let paystackPlanCode: string | undefined

  if (Array.isArray(modules)) {
    // Bundle checkout (the pricing calculator) -- several modules in one
    // Paystack transaction. Priced from the same shared formula the
    // calculator itself displays, never from paystack_plans (whose
    // per-tier amounts don't reflect the calculator's Basic-tier
    // core/add-on distinction) -- so what's shown is what's charged.
    if (modules.length === 0 || !modules.every(isModuleKey)) {
      return NextResponse.json({ error: 'modules must be a non-empty array of known module keys' }, { status: 400 })
    }
    const tierKey = tier as Tier
    const modulePrices: Record<string, number> = {}
    let perUserMonthly = 0
    for (const key of modules) {
      const mod = MODULES.find((m) => m.key === key)!
      const price = moduleMonthlyPrice(tierKey, mod)
      modulePrices[key] = price
      perUserMonthly += price
    }
    totalAmount = perUserMonthly * seatCount * 100 // Paystack uses kobo

    metadata = {
      tenant_id: profile.tenant_id,
      user_id: user.id,
      modules,
      tier,
      seat_count: seatCount,
      module_prices: modulePrices,
    }
  } else {
    // Legacy single-module checkout (the sidebar's "locked module" upsell).
    if (!module) {
      return NextResponse.json({ error: 'module and tier are required' }, { status: 400 })
    }

    const { data: plan } = await supabaseAdmin
      .from('paystack_plans')
      .select('plan_code, amount')
      .eq('module', module)
      .eq('tier', tier)
      .eq('currency', currency)
      .single()

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found for this module/tier/currency combination' }, { status: 404 })
    }

    totalAmount = plan.amount * seatCount * 100
    paystackPlanCode = plan.plan_code
    metadata = {
      tenant_id: profile.tenant_id,
      user_id: user.id,
      module,
      tier,
      seat_count: seatCount,
      price_per_user: plan.amount,
    }
  }

  // Initialize Paystack transaction
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      amount: totalAmount,
      currency,
      ...(paystackPlanCode ? { plan: paystackPlanCode } : {}),
      metadata,
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/verify`,
    }),
  })

  const data = await response.json()

  if (!data.status) {
    return NextResponse.json({ error: data.message || 'Failed to initialize payment' }, { status: 500 })
  }

  return NextResponse.json({
    authorization_url: data.data.authorization_url,
    reference: data.data.reference,
    amount: totalAmount / 100,
    seats: seatCount,
  })
}
