import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  // Verify webhook signature
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(body)
    .digest('hex')

  if (hash !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  console.log('Paystack webhook event:', event.event)

  if (event.event === 'charge.success') {
    const metadata = event.data.metadata
    const { tenant_id, module, tier, price_per_user } = metadata || {}

    if (!tenant_id || !module || !tier) {
      return NextResponse.json({ received: true })
    }

    const now = new Date()
    const nextMonth = new Date(now)
    nextMonth.setMonth(nextMonth.getMonth() + 1)

    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('module', module)
      .single()

    if (existing) {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          tier,
          is_active: true,
          price_per_user,
          billing_cycle_start: now.toISOString(),
          billing_cycle_end: nextMonth.toISOString(),
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
        })
    }
  }

  if (event.event === 'subscription.disable') {
    const subscriptionCode = event.data.subscription_code
    if (subscriptionCode) {
      await supabaseAdmin
        .from('subscriptions')
        .update({ is_active: false })
        .eq('paystack_subscription_code', subscriptionCode)
    }
  }

  if (event.event === 'invoice.payment_failed') {
    const subscriptionCode = event.data.subscription?.subscription_code
    if (subscriptionCode) {
      await supabaseAdmin
        .from('subscriptions')
        .update({ is_active: false })
        .eq('paystack_subscription_code', subscriptionCode)
    }
  }

  return NextResponse.json({ received: true })
}