import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { loadTeamProfitability } from '@/lib/accounttrack/load-matter-profitability'

const ALLOWED_ROLES = ['owner', 'admin', 'accounts']

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })
  // Firmwide, cross-client data -- stricter than a single matter/client view.
  if (!ALLOWED_ROLES.includes(profile.role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const groupBy = searchParams.get('groupBy') === 'law_type' ? 'law_type' : 'responsible_lawyer'

  const groups = await loadTeamProfitability(profile.tenant_id, groupBy)

  return NextResponse.json({ groupBy, groups })
}
