import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// No equivalent "create category" route exists for lawyer_categories today
// (those are seeded out-of-band) — this is a minimal addition so the
// "Accounts 1/2/3" tiers the user asked for can actually be created.
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: categories } = await supabaseAdmin
    .from('accounts_categories')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('sort_order')

  return NextResponse.json({ categories })
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

  const { name, sort_order } = await request.json()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: category, error } = await supabaseAdmin
    .from('accounts_categories')
    .insert({
      tenant_id: profile.tenant_id,
      name,
      sort_order: Number(sort_order) || 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category })
}
