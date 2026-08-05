import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CURRENCY_RE = /^[A-Z]{3}$/

// GET ?from=X&to=Y returns full dated history for that pair (most recent
// first). With no params, returns the latest rate per distinct pair the
// tenant has ever set.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (from && to) {
    const { data: rates, error } = await supabaseAdmin
      .from('accounttrack_exchange_rates')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('from_currency', from)
      .eq('to_currency', to)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rates })
  }

  const { data: allRates, error } = await supabaseAdmin
    .from('accounttrack_exchange_rates')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Latest row per distinct (from_currency, to_currency) pair -- rows are
  // already ordered most-recent-first, so the first occurrence of each
  // pair key is the current rate.
  const seen = new Set<string>()
  const latestPerPair = (allRates || []).filter((r) => {
    const key = `${r.from_currency}->${r.to_currency}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return NextResponse.json({ rates: latestPerPair })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { from_currency, to_currency, rate, effective_date } = await request.json()
  if (!from_currency || !CURRENCY_RE.test(from_currency) || !to_currency || !CURRENCY_RE.test(to_currency)) {
    return NextResponse.json({ error: 'from_currency and to_currency must be 3-letter uppercase codes' }, { status: 400 })
  }
  if (!rate || Number(rate) <= 0) {
    return NextResponse.json({ error: 'rate must be a positive number' }, { status: 400 })
  }

  const { data: org } = await supabaseAdmin
    .from('organizations').select('base_currency').eq('id', profile.tenant_id).single()
  const { data: enabled } = await supabaseAdmin
    .from('accounttrack_currency_settings').select('currency').eq('tenant_id', profile.tenant_id)
  const allowed = new Set([org?.base_currency, ...(enabled || []).map((r) => r.currency)])

  if (!allowed.has(from_currency) || !allowed.has(to_currency)) {
    return NextResponse.json({ error: 'Both currencies must be the base currency or an enabled currency for this tenant' }, { status: 400 })
  }

  const { data: newRate, error } = await supabaseAdmin
    .from('accounttrack_exchange_rates')
    .insert({
      tenant_id: profile.tenant_id,
      from_currency,
      to_currency,
      rate: Number(rate),
      effective_date: effective_date || new Date().toISOString().split('T')[0],
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rate: newRate })
}
