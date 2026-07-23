import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { getValidGraphToken } from '@/lib/microsoft-graph/tokens'
import { listFollowedSharePointSites, searchSharePointSites, GraphApiError } from '@/lib/microsoft-graph/client'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'doctrack'))) {
    return NextResponse.json({ error: 'DocTrack is not active for this tenant' }, { status: 403 })
  }

  const accessToken = await getValidGraphToken(user.id)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Connect (or reconnect) your Microsoft account from My Account to link SharePoint files' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  try {
    const sites = q ? await searchSharePointSites(accessToken, q) : await listFollowedSharePointSites(accessToken)
    return NextResponse.json({ sites })
  } catch (err) {
    const message = err instanceof GraphApiError ? err.message : 'Could not browse SharePoint sites'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
