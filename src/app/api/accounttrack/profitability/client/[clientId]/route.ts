import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { loadClientProfitability } from '@/lib/accounttrack/load-matter-profitability'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_ROLES = ['owner', 'admin', 'accounts']

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })
  if (!ALLOWED_ROLES.includes(profile.role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { rollup, matters } = await loadClientProfitability(profile.tenant_id, clientId)

  return NextResponse.json({
    client,
    rollup,
    matters: matters.map((m) => ({
      matterId: m.matterId,
      matter_id: m.matter.matter_id,
      case_name: m.matter.case_name,
      profitability: m.profitability,
    })),
  })
}
