import { NextResponse } from 'next/server'
import { activateSubscriptions } from '@/lib/billing/activate-subscription'

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
    return NextResponse.redirect(new URL('/dashboard?payment=failed', request.url))
  }

  await activateSubscriptions({
    tenantId: tenant_id,
    tier,
    modulePrices,
    paystackSubscriptionCode: data.data.subscription_code,
  })

  return NextResponse.redirect(new URL('/dashboard?payment=success', request.url))
}
