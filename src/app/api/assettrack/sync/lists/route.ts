import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { getValidGraphToken } from '@/lib/microsoft-graph/tokens'
import { listSharePointLists, GraphApiError } from '@/lib/microsoft-graph/client'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get('site_id')
  if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 })

  const accessToken = await getValidGraphToken(user.id)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Connect (or reconnect) your Microsoft account from My Account to sync the asset register' },
      { status: 403 }
    )
  }

  try {
    const lists = await listSharePointLists(accessToken, siteId)
    return NextResponse.json({ lists })
  } catch (err) {
    const message = err instanceof GraphApiError ? err.message : 'Could not list this site\'s lists'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
