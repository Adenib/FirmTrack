import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { getValidGraphToken } from '@/lib/microsoft-graph/tokens'
import { getSiteDefaultDrive, getDriveItemMetadata, GraphApiError } from '@/lib/microsoft-graph/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Links a SharePoint document library file into DocTrack -- stores a
// reference (item id, web link, and a metadata snapshot), never copies
// the file's bytes into our own storage. No document_versions row:
// SharePoint is the versioning authority for a linked document, not
// this app (same model as the existing OneDrive link route).
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'doctrack'))) {
    return NextResponse.json({ error: 'DocTrack is not active for this tenant' }, { status: 403 })
  }

  const { site_id, item_id, title, matter_id, category } = await request.json()
  if (!site_id || !item_id || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'site_id, item_id, and title are required' }, { status: 400 })
  }

  let matter: { id: string; responsible_lawyer: string | null } | null = null
  if (matter_id) {
    const { data } = await supabaseAdmin
      .from('matters')
      .select('id, responsible_lawyer')
      .eq('id', matter_id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!data) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    matter = data
  }
  if (!canAccessMatterDocument(profile, matter)) {
    return NextResponse.json({ error: 'Not authorized to link documents for this matter' }, { status: 403 })
  }

  const accessToken = await getValidGraphToken(user.id)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Connect (or reconnect) your Microsoft account from My Account to link SharePoint files' },
      { status: 403 }
    )
  }

  let metadata
  try {
    const drive = await getSiteDefaultDrive(accessToken, site_id)
    metadata = await getDriveItemMetadata(accessToken, drive.id, item_id)
  } catch (err) {
    const message = err instanceof GraphApiError ? err.message : 'Could not read file metadata from SharePoint'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const { data: document, error } = await supabaseAdmin
    .from('documents')
    .insert({
      tenant_id: profile.tenant_id,
      matter_id: matter?.id || null,
      title: title.trim(),
      category: typeof category === 'string' && category.trim() ? category.trim() : null,
      created_by: user.id,
      external_source: 'sharepoint',
      external_item_id: item_id,
      external_web_url: metadata.webUrl,
      external_filename: metadata.name,
      external_size_bytes: metadata.size,
      external_modified_at: metadata.lastModifiedDateTime,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('document_events').insert({
    tenant_id: profile.tenant_id,
    document_id: document.id,
    user_id: user.id,
    event_type: 'created',
    metadata: { source: 'sharepoint', filename: metadata.name },
  })

  return NextResponse.json({ document })
}
