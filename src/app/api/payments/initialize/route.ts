import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

  const { module, tier, currency = 'NGN' } = await request.json()

  if (!module || !tier) {
    return NextResponse.json({ error: 'module and tier are required' }, { status: 400 })
  }

  // Get the Paystack plan code
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

  // Get seat count for this org
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', profile.tenant_id)

  const seatCount = users?.length || 1
  const totalAmount = plan.amount * seatCount * 100 // Paystack uses kobo

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
      plan: plan.plan_code,
      metadata: {
        tenant_id: profile.tenant_id,
        user_id: user.id,
        module,
        tier,
        seat_count: seatCount,
        price_per_user: plan.amount,
      },
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