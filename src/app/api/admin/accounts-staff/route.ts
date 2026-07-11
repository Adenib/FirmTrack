import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors src/app/api/admin/lawyers/route.ts exactly, minus rates
// (accounts staff don't have billing-rate tiers).
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: staff } = await supabaseAdmin
    .from('accounts_staff')
    .select(`
      *,
      accounts_categories(name),
      users(email)
    `)
    .eq('tenant_id', profile.tenant_id)
    .order('full_name')

  const { data: categories } = await supabaseAdmin
    .from('accounts_categories')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('sort_order')

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, email, role')
    .eq('tenant_id', profile.tenant_id)
    .eq('role', 'accounts')

  return NextResponse.json({ staff, categories, users })
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

  const { user_id, full_name, nickname, initials, category_id, status } = await request.json()

  if (!user_id || !full_name) {
    return NextResponse.json({ error: 'user_id and full_name are required' }, { status: 400 })
  }

  const { data: staffMember, error } = await supabaseAdmin
    .from('accounts_staff')
    .insert({
      tenant_id: profile.tenant_id,
      user_id,
      full_name,
      nickname: nickname ? nickname.toUpperCase() : null,
      initials: initials ? initials.toUpperCase() : null,
      category_id: category_id || null,
      status: status || 'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: staffMember })
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
    .from('accounts_staff')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data })
}
