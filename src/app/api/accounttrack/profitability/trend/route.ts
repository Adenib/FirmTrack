import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { loadMatterTrend, loadClientTrend } from '@/lib/accounttrack/load-matter-profitability'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_ROLES = ['owner', 'admin', 'accounts']

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })
  if (!ALLOWED_ROLES.includes(profile.role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matterId')
  const clientId = searchParams.get('clientId')
  const groupBy = searchParams.get('groupBy') === 'quarter' ? 'quarter' : 'month'

  if (!matterId && !clientId) {
    return NextResponse.json({ error: 'matterId or clientId is required' }, { status: 400 })
  }

  if (matterId) {
    const { data: matter } = await supabaseAdmin
      .from('matters').select('id').eq('id', matterId).eq('tenant_id', profile.tenant_id).maybeSingle()
    if (!matter) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    const trend = await loadMatterTrend(profile.tenant_id, matterId, groupBy)
    return NextResponse.json({ groupBy, trend })
  }

  const { data: client } = await supabaseAdmin
    .from('clients').select('id').eq('id', clientId!).eq('tenant_id', profile.tenant_id).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const trend = await loadClientTrend(profile.tenant_id, clientId!, groupBy)
  return NextResponse.json({ groupBy, trend })
}
