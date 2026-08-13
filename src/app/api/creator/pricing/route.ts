import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { getPricingTable } from '@/lib/billing/get-pricing-table'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const currency = searchParams.get('currency') || 'NGN'
  const priceTable = await getPricingTable(currency)
  return NextResponse.json({ priceTable, currency })
}

// Updates the live standard price for one module+tier+currency. If a
// paystack_plans row exists for that exact combination, also attempts to
// sync the live Paystack Plan amount -- that's the shared recurring-charge
// object every org on that tier is attached to, so this is the one case
// where a global price change SHOULD reach into Paystack (unlike a
// per-org override/rebate, which would incorrectly discount every other
// org sharing that same plan).
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('id, role, status')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'pricing')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { module, tier, price, currency = 'NGN' } = await request.json()
  if (!module || !tier || price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
    return NextResponse.json({ error: 'module, tier, and a non-negative price are required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('platform_module_pricing')
    .update({ price: Number(price), updated_at: new Date().toISOString(), updated_by: admin.id })
    .eq('module', module)
    .eq('tier', tier)
    .eq('currency', currency)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort Paystack sync -- never blocks the DB write, which is the
  // source of truth for FirmTrack's own checkout/records regardless.
  let paystackSynced = false
  let paystackError: string | undefined

  const { data: plan } = await supabaseAdmin
    .from('paystack_plans')
    .select('plan_code, amount')
    .eq('module', module)
    .eq('tier', tier)
    .eq('currency', currency)
    .maybeSingle()

  if (plan) {
    try {
      const response = await fetch(`https://api.paystack.co/plan/${plan.plan_code}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: Math.round(Number(price) * 100) }),
      })
      const data = await response.json()
      if (!data.status) {
        paystackError = data.message || 'Paystack plan update failed'
      } else {
        await supabaseAdmin.from('paystack_plans').update({ amount: Number(price) }).eq('plan_code', plan.plan_code)
        paystackSynced = true
      }
    } catch (err) {
      paystackError = err instanceof Error ? err.message : String(err)
    }
  }

  return NextResponse.json({ success: true, paystackSynced, paystackError })
}
