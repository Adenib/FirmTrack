import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { getValidGraphToken } from '@/lib/microsoft-graph/tokens'
import { getSiteByServerRelativePath, listSharePointLists, GraphApiError } from '@/lib/microsoft-graph/client'

// Resolves a pasted SharePoint/Microsoft List URL end to end -- site, its
// lists, and a best-effort match of the list name parsed from the URL.
// This is the path for personal OneDrive sites ("*-my.sharepoint.com/
// personal/<user>") hosting a Microsoft List, which never appear in
// /me/followedSites or a tenant-wide site search (both only surface team/
// communication sites), so browsing can't reach them -- only a direct URL.
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
  const listUrl = searchParams.get('url')
  if (!listUrl) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(listUrl)
  } catch {
    return NextResponse.json({ error: 'Not a valid URL' }, { status: 400 })
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  const listsIdx = segments.findIndex((s) => s.toLowerCase() === 'lists')
  const sitePathSegments = listsIdx >= 0 ? segments.slice(0, listsIdx) : segments.slice(0, -1)
  const sitePath = `/${sitePathSegments.join('/')}`
  const listNameGuess = listsIdx >= 0 ? decodeURIComponent(segments[listsIdx + 1] || '') : null

  const accessToken = await getValidGraphToken(user.id)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Connect (or reconnect) your Microsoft account from My Account to sync the asset register' },
      { status: 403 }
    )
  }

  try {
    const site = await getSiteByServerRelativePath(accessToken, parsed.hostname, sitePath)
    const lists = await listSharePointLists(accessToken, site.id)
    const matched = listNameGuess
      ? lists.find((l) => l.name.toLowerCase().replace(/[\s_-]/g, '') === listNameGuess.toLowerCase().replace(/[\s_-]/g, ''))
      : undefined

    return NextResponse.json({ site, lists, matchedListId: matched?.id || null })
  } catch (err) {
    const message = err instanceof GraphApiError ? err.message : 'Could not resolve this URL to a SharePoint site'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
