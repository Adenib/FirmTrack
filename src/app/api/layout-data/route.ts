import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { LOGO_BUCKET } from '@/lib/branding/constants'

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
    .select('*, organizations(id, name, plan, logo_path)')
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

  const organizations = profile.organizations as { id: string; name: string; plan: string; logo_path: string | null } | null
  let logoUrl: string | null = null
  if (organizations?.logo_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(organizations.logo_path, 60 * 60 * 24)
    logoUrl = signed?.signedUrl || null
  }

  return NextResponse.json({
    organization: organizations ? { id: organizations.id, name: organizations.name, plan: organizations.plan, logoUrl } : null,
    profile: { email: profile.email, role: profile.role },
    activeModules,
  })
}