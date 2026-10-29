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
    field_mapping, sla_days, notification_email,
  } = body

  // SharePoint fields are a pair -- either both are provided (wiring up or
  // changing the connection) or neither is, so a caller can save just
  // notification_email or sla_days without resending the whole mapping.
  if ((sharepoint_site_id || sharepoint_list_id) && !(sharepoint_site_id && sharepoint_list_id)) {
    return NextResponse.json({ error: 'sharepoint_site_id and sharepoint_list_id must be set together' }, { status: 400 })
  }
  if (sla_days != null && (!Number.isFinite(Number(sla_days)) || Number(sla_days) <= 0)) {
    return NextResponse.json({ error: 'sla_days must be a positive number' }, { status: 400 })
  }

  // notification_email may hold several comma-separated addresses (e.g.
  // "it@aelex.com, backup-it@aelex.com") -- validate and normalize each one
  // rather than the raw string, since this is the only place it's ever
  // written.
  let normalizedNotificationEmail: string | null | undefined = undefined
  if (notification_email !== undefined) {
    if (!notification_email) {
      normalizedNotificationEmail = null
    } else {
      const addresses = [...new Set(String(notification_email).split(',').map((a: string) => a.trim()).filter(Boolean))]
      const invalid = addresses.filter((a) => !/^\S+@\S+\.\S+$/.test(a))
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Not a valid email address: ${invalid.join(', ')}` }, { status: 400 })
      }
      normalizedNotificationEmail = addresses.join(', ')
    }
  }

  const patch: Record<string, unknown> = { tenant_id: profile.tenant_id, updated_at: new Date().toISOString() }
  if (sharepoint_site_id) {
    patch.sharepoint_site_id = sharepoint_site_id
    patch.sharepoint_site_name = sharepoint_site_name || null
    patch.sharepoint_list_id = sharepoint_list_id
    patch.sharepoint_list_name = sharepoint_list_name || null
  }
  if (field_mapping !== undefined) patch.field_mapping = field_mapping || {}
  if (sla_days !== undefined) patch.sla_days = Number(sla_days)
  if (notification_email !== undefined) patch.notification_email = normalizedNotificationEmail

  const { data: settings, error } = await supabaseAdmin
    .from('assettrack_sync_settings')
    .upsert(patch, { onConflict: 'tenant_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ settings })
}
