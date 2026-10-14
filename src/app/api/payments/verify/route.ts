import { NextResponse } from 'next/server'
import { activateSubscriptions } from '@/lib/billing/activate-subscription'

// Called client-side by /billing/order to display order status. The
// Paystack webhook (api/webhooks/paystack) is the reliable, browser-
// independent activation path; activateSubscriptions() here is a fast-path
// duplicate call so the order page doesn't have to wait on the webhook --
// it's a plain upsert, so calling it twice for the same transaction is safe.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')
  const trxref = searchParams.get('trxref')

  const ref = reference || trxref

  if (!ref) {
    return NextResponse.json({ status: 'failed', error: 'Missing payment reference' }, { status: 400 })
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
  })

  const data = await response.json()

  if (!data.status || data.data.status !== 'success') {
    return NextResponse.json({ status: 'failed', error: data.data?.gateway_response || 'Payment was not successful' })
  }

  const metadata = data.data.metadata
  const { tier } = metadata

  // Bundle purchase (the pricing calculator) carries modules/module_prices;
  // a legacy single-module purchase (the sidebar upsell) carries just
  // module/price_per_user -- normalize both into one modulePrices map.
  let modulePrices: Record<string, number> | undefined
  if (metadata.modules && metadata.module_prices) {
    modulePrices = metadata.module_prices
  } else if (metadata.module) {
    modulePrices = { [metadata.module]: metadata.price_per_user }
  }

  if (!metadata.tenant_id || !tier || !modulePrices) {
    return NextResponse.json({ status: 'failed', error: 'Payment succeeded but order details were incomplete' })
  }

  await activateSubscriptions({
    tenantId: metadata.tenant_id,
    tier,
    modulePrices,
    paystackSubscriptionCode: data.data.subscription_code,
  })

  return NextResponse.json({
    status: 'success',
    tier,
    seats: metadata.seat_count,
    amount: data.data.amount / 100,
    currency: data.data.currency,
    modules: Object.entries(modulePrices).map(([key, pricePerUser]) => ({ key, pricePerUser })),
  })
}
