import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ organization: null, profile: null, activeModules: [] })
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('*, organizations(id, name, plan)')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ organization: null, profile: null, activeModules: [] })
  }

  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('module')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)

  const activeModules = (subscriptions || []).map((s) => s.module)

  return NextResponse.json({
    organization: profile.organizations,
    profile: { email: profile.email, role: profile.role },
    activeModules,
  })
}