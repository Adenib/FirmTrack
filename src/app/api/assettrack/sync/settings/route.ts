import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin access required' }, { status: 403 })
  }

  const { data: settings } = await supabaseAdmin
    .from('assettrack_sync_settings')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()

  return NextResponse.json({ settings: settings || null })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const {
    sharepoint_site_id, sharepoint_site_name, sharepoint_list_id, sharepoint_list_name,
    field_mapping, sla_days,
  } = body

  if (!sharepoint_site_id || !sharepoint_list_id) {
    return NextResponse.json({ error: 'sharepoint_site_id and sharepoint_list_id are required' }, { status: 400 })
  }
  if (sla_days != null && (!Number.isFinite(Number(sla_days)) || Number(sla_days) <= 0)) {
    return NextResponse.json({ error: 'sla_days must be a positive number' }, { status: 400 })
  }

  const { data: settings, error } = await supabaseAdmin
    .from('assettrack_sync_settings')
    .upsert({
      tenant_id: profile.tenant_id,
      sharepoint_site_id,
      sharepoint_site_name: sharepoint_site_name || null,
      sharepoint_list_id,
      sharepoint_list_name: sharepoint_list_name || null,
      field_mapping: field_mapping || {},
      sla_days: sla_days != null ? Number(sla_days) : 14,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ settings })
}
