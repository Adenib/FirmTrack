import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CURRENCY_RE = /^[A-Z]{3}$/

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: org } = await supabaseAdmin
    .from('organizations').select('base_currency').eq('id', profile.tenant_id).single()

  const { data: enabled, error } = await supabaseAdmin
    .from('accounttrack_currency_settings')
    .select('currency, enabled_at')
    .eq('tenant_id', profile.tenant_id)
    .order('enabled_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count: journalEntryCount } = await supabaseAdmin
    .from('journal_entries').select('id', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id)

  return NextResponse.json({
    base_currency: org?.base_currency || 'NGN',
    enabled_currencies: (enabled || []).map((r) => r.currency),
    base_currency_locked: (journalEntryCount || 0) > 0,
  })
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

  const { currency } = await request.json()
  if (!currency || !CURRENCY_RE.test(currency)) {
    return NextResponse.json({ error: 'currency must be a 3-letter uppercase code (e.g. USD)' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('accounttrack_currency_settings')
    .upsert({ tenant_id: profile.tenant_id, currency, enabled_by: user.id }, { onConflict: 'tenant_id,currency' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Base currency is freely editable up until the tenant's first posted
// journal entry, then locked -- changing a reporting currency after real
// transactions exist requires a full historical restatement, which is
// out of scope here. App-level guard (not a DB trigger), matching this
// codebase's general preference.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { base_currency } = await request.json()
  if (!base_currency || !CURRENCY_RE.test(base_currency)) {
    return NextResponse.json({ error: 'base_currency must be a 3-letter uppercase code (e.g. NGN)' }, { status: 400 })
  }

  const { count } = await supabaseAdmin
    .from('journal_entries').select('id', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id)
  if ((count || 0) > 0) {
    return NextResponse.json({ error: 'Base currency is locked once your firm has posted transactions' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('organizations').update({ base_currency }).eq('id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const currency = searchParams.get('currency')
  if (!currency) return NextResponse.json({ error: 'currency is required' }, { status: 400 })

  const { count: clientCount } = await supabaseAdmin
    .from('clients').select('id', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id).eq('billing_currency', currency)
  const { count: matterCount } = await supabaseAdmin
    .from('matters').select('id', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id).eq('billing_currency', currency)
  const { count: accountCount } = await supabaseAdmin
    .from('chart_of_accounts').select('id', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id).eq('currency', currency)

  if ((clientCount || 0) > 0 || (matterCount || 0) > 0 || (accountCount || 0) > 0) {
    return NextResponse.json({ error: 'Cannot remove a currency still in use by a client, matter, or account' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('accounttrack_currency_settings')
    .delete()
    .eq('tenant_id', profile.tenant_id)
    .eq('currency', currency)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
