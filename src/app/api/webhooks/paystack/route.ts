import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { activateSubscriptions } from '@/lib/billing/activate-subscription'

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
    const metadata = event.data.metadata || {}
    const { tenant_id, tier } = metadata

    // Bundle purchase (the pricing calculator) carries modules/module_prices;
    // a legacy single-module purchase (the sidebar upsell) carries just
    // module/price_per_user -- normalize both into one modulePrices map.
    let modulePrices: Record<string, number> | undefined
    if (metadata.modules && metadata.module_prices) {
      modulePrices = metadata.module_prices
    } else if (metadata.module) {
      modulePrices = { [metadata.module]: metadata.price_per_user }
    }

    if (!tenant_id || !tier || !modulePrices) {
      return NextResponse.json({ received: true })
    }

    await activateSubscriptions({ tenantId: tenant_id, tier, modulePrices })
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