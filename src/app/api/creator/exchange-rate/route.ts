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

  const { data: admin } = await supabaseAdmin
    .from('platform_admins').select('role').eq('user_id', user.id).single()
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { rate } = await request.json()
  if (!rate || isNaN(parseFloat(rate))) {
    return NextResponse.json({ error: 'Valid rate is required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('exchange_rates')
    .update({ rate: parseFloat(rate) })
    .eq('is_platform', true)
    .eq('from_currency', 'USD')
    .eq('to_currency', 'NGN')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also update platform settings
  await supabaseAdmin
    .from('platform_settings')
    .update({ value: rate.toString(), updated_at: new Date().toISOString() })
    .eq('key', 'usd_ngn_rate')

  return NextResponse.json({ success: true, rate: parseFloat(rate) })
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('exchange_rates')
    .select('rate, effective_from, updated_at')
    .eq('is_platform', true)
    .single()

  const { data: settings } = await supabaseAdmin
    .from('platform_settings')
    .select('key, value')
    .in('key', ['default_associate_rate_usd', 'default_senior_associate_rate_usd', 'default_partner_rate_usd'])

  return NextResponse.json({ exchange_rate: data, settings })
}