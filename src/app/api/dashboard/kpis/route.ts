import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getPartnerKpis } from '@/lib/dashboard/partner-kpis'

// Exists purely for HTTP-level testability, matching every other route's
// test pattern in this codebase -- the dashboard page itself calls
// getPartnerKpis directly (a Server Component doesn't need a network
// round-trip to its own server).
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('module')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)
  const activeModules = new Set((subscriptions || []).map((s) => s.module))

  const kpis = await getPartnerKpis(profile.tenant_id, activeModules)
  return NextResponse.json(kpis)
}
