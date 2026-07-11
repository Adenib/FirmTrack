import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')
  const trxref = searchParams.get('trxref')

  const ref = reference || trxref

  if (!ref) {
    return NextResponse.redirect(new URL('/dashboard?payment=failed', request.url))
  }

  // Verify with Paystack
  const response = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
  })

  const data = await response.json()

  if (!data.status || data.data.status !== 'success') {
    return NextResponse.redirect(new URL('/dashboard?payment=failed', request.url))
  }

  const metadata = data.data.metadata
  const { tenant_id, module, tier, price_per_user } = metadata

  if (!tenant_id || !module || !tier) {
    return NextResponse.redirect(new URL('/dashboard?payment=failed', request.url))
  }

  // Update or create subscription
  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('module', module)
    .single()

  const now = new Date()
  const nextMonth = new Date(now)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  if (existing) {
    await supabaseAdmin
      .from('subscriptions')
      .update({
        tier,
        is_active: true,
        price_per_user,
        billing_cycle_start: now.toISOString(),
        billing_cycle_end: nextMonth.toISOString(),
        paystack_subscription_code: data.data.subscription_code || null,
      })
      .eq('tenant_id', tenant_id)
      .eq('module', module)
  } else {
    await supabaseAdmin
      .from('subscriptions')
      .insert({
        tenant_id,
        module,
        tier,
        is_active: true,
        price_per_user,
        billing_cycle_start: now.toISOString(),
        billing_cycle_end: nextMonth.toISOString(),
        paystack_subscription_code: data.data.subscription_code || null,
      })
  }

  // Update org plan if this tier is higher
  const tierOrder = { free: 0, basic: 1, standard: 2, elite: 3 }
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('plan')
    .eq('id', tenant_id)
    .single()

  if (org && (tierOrder[tier as keyof typeof tierOrder] > tierOrder[org.plan as keyof typeof tierOrder])) {
    await supabaseAdmin
      .from('organizations')
      .update({ plan: tier })
      .eq('id', tenant_id)
  }

  return NextResponse.redirect(new URL('/dashboard?payment=success', request.url))
}