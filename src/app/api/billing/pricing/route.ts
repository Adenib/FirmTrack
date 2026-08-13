import { NextResponse } from 'next/server'
import { getPricingTable } from '@/lib/billing/get-pricing-table'

// Public, unauthenticated -- pricing is pre-signup information. Returns
// the live standard pricing table (module -> tier -> price), editable via
// the Creator Console at /creator/pricing.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const currency = searchParams.get('currency') || 'NGN'
  const priceTable = await getPricingTable(currency)
  return NextResponse.json({ priceTable, currency })
}
