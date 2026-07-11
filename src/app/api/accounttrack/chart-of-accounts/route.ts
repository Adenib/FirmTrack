import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: accounts, error } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('code')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts })
}

// Custom accounts only — the 8 default (keyed) accounts are seeded at
// tenant creation and can't be created again here (key is always null for
// accounts added through this route).
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { code, name, account_type } = await request.json()
  if (!name || !['asset', 'liability', 'equity', 'revenue', 'expense'].includes(account_type)) {
    return NextResponse.json({ error: 'name and a valid account_type are required' }, { status: 400 })
  }

  const { data: account, error } = await supabaseAdmin
    .from('chart_of_accounts')
    .insert({
      tenant_id: profile.tenant_id,
      key: null,
      code: code || null,
      name,
      account_type,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account })
}

export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: account } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id, key')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  if (account.key) {
    return NextResponse.json({ error: 'Default accounts cannot be deleted' }, { status: 400 })
  }

  const { count } = await supabaseAdmin
    .from('journal_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id)

  if ((count || 0) > 0) {
    return NextResponse.json({ error: 'Cannot delete an account with posted journal lines' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('chart_of_accounts')
    .delete()
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
