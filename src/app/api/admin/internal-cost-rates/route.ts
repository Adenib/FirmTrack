import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: rates } = await supabaseAdmin
    .from('internal_cost_rates')
    .select('*, lawyers(full_name, nickname), lawyer_categories(name)')
    .eq('tenant_id', profile.tenant_id)
    .order('effective_from', { ascending: false })

  return NextResponse.json({ rates })
}

// Internal cost rates are cost-sensitive (they drive every profitability
// figure) even though they're deliberately not salary data -- restricted
// to owner/admin, same as who can set billing rates in /admin/lawyers.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { lawyer_id, category_id, rate, currency, effective_from } = await request.json()

  if (!lawyer_id && !category_id) {
    return NextResponse.json({ error: 'lawyer_id or category_id is required' }, { status: 400 })
  }
  if (lawyer_id && category_id) {
    return NextResponse.json({ error: 'Set a rate for a lawyer OR a grade, not both' }, { status: 400 })
  }
  if (!rate || Number(rate) <= 0) {
    return NextResponse.json({ error: 'rate must be greater than 0' }, { status: 400 })
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('internal_cost_rates')
    .insert({
      tenant_id: profile.tenant_id,
      lawyer_id: lawyer_id || null,
      category_id: category_id || null,
      rate: Number(rate),
      currency: currency || 'NGN',
      effective_from: effective_from || new Date().toISOString().split('T')[0],
      created_by: user.id,
    })
    .select('*, lawyers(full_name, nickname), lawyer_categories(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rate: inserted })
}
