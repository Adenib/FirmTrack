import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: lawyers } = await supabaseAdmin
    .from('lawyers')
    .select(`
      *,
      lawyer_categories(name),
      users(email),
      lawyer_rates(rate_type, amount_usd, effective_from)
    `)
    .eq('tenant_id', profile.tenant_id)
    .order('full_name')

  const { data: categories } = await supabaseAdmin
    .from('lawyer_categories')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('sort_order')

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, email, role')
    .eq('tenant_id', profile.tenant_id)

  const { data: exchangeRate } = await supabaseAdmin
    .from('exchange_rates')
    .select('rate')
    .eq('is_platform', true)
    .single()

  return NextResponse.json({ lawyers, categories, users, exchangeRate })
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

  const { user_id, full_name, nickname, initials, category_id, status, rates } = await request.json()

  if (!user_id || !full_name || !nickname || !initials) {
    return NextResponse.json({ error: 'user_id, full_name, nickname and initials are required' }, { status: 400 })
  }

  const { data: lawyer, error: lawyerError } = await supabaseAdmin
    .from('lawyers')
    .insert({
      tenant_id: profile.tenant_id,
      user_id,
      full_name,
      nickname: nickname.toUpperCase(),
      initials: initials.toUpperCase(),
      category_id: category_id || null,
      status: status || 'active',
    })
    .select()
    .single()

  if (lawyerError || !lawyer) {
    return NextResponse.json({ error: lawyerError?.message || 'Failed to create lawyer' }, { status: 500 })
  }

  // Insert rates A-E
  if (rates && Array.isArray(rates)) {
    const rateRows = rates
      .filter(r => r.amount_usd > 0)
      .map(r => ({
        tenant_id: profile.tenant_id,
        lawyer_id: lawyer.id,
        rate_type: r.rate_type,
        amount_usd: r.amount_usd,
        effective_from: new Date().toISOString().split('T')[0],
      }))
    if (rateRows.length > 0) {
      await supabaseAdmin.from('lawyer_rates').insert(rateRows)
    }
  }

  return NextResponse.json({ lawyer })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { id, status } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lawyer: data })
}