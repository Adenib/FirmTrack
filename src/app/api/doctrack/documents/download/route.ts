import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { DOCUMENTS_BUCKET } from '@/lib/doctrack/constants'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns a short-lived signed URL rather than exposing the bucket path
// directly -- the bucket is private, so this is the only way to read a
// file, and it lets us apply canAccessMatterDocument per request.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const documentId = searchParams.get('document_id')
  const versionNumber = searchParams.get('version')
  if (!documentId) return NextResponse.json({ error: 'document_id is required' }, { status: 400 })

  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*, matters(id, responsible_lawyer)')
    .eq('id', documentId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!canAccessMatterDocument(profile, document.matters as { responsible_lawyer: string | null } | null)) {
    return NextResponse.json({ error: 'Not authorized to download this document' }, { status: 403 })
  }

  let versionQuery = supabaseAdmin.from('document_versions').select('*').eq('document_id', documentId)
  versionQuery = versionNumber
    ? versionQuery.eq('version_number', Number(versionNumber))
    : versionQuery.order('version_number', { ascending: false }).limit(1)
  const { data: version } = await versionQuery.single()
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

  const { data: signed, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(version.storage_path, 300)
  if (error || !signed) return NextResponse.json({ error: error?.message || 'Could not sign URL' }, { status: 500 })

  await supabaseAdmin.from('document_events').insert({
    tenant_id: profile.tenant_id,
    document_id: documentId,
    user_id: user.id,
    event_type: 'downloaded',
    metadata: { version_number: version.version_number },
  })

  return NextResponse.json({ url: signed.signedUrl, filename: version.filename })
}
