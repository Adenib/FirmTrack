import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_SIZE, ALLOWED_DOCUMENT_TYPES } from '@/lib/doctrack/constants'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A new version is always a new row + a new storage object -- never
// touches a prior version's row or file, which is what actually makes
// the version history append-only in practice (the DB grants revoked
// in the migration are the backstop, not the only safeguard).
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const formData = await request.formData()
  const documentId = formData.get('document_id')
  const file = formData.get('file')
  if (typeof documentId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'document_id and file are required' }, { status: 400 })
  }

  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*, matters(id, responsible_lawyer)')
    .eq('id', documentId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .single()
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!canAccessMatterDocument(profile, document.matters as { responsible_lawyer: string | null } | null)) {
    return NextResponse.json({ error: 'Not authorized to update this document' }, { status: 403 })
  }

  if (!ALLOWED_DOCUMENT_TYPES[file.type]) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    return NextResponse.json({ error: 'File must be 25MB or smaller' }, { status: 400 })
  }

  const { data: lastVersion } = await supabaseAdmin
    .from('document_versions')
    .select('version_number')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()
  const nextVersion = (lastVersion?.version_number || 0) + 1

  const path = `${profile.tenant_id}/${documentId}/${nextVersion}-${file.name}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: version, error } = await supabaseAdmin
    .from('document_versions')
    .insert({
      document_id: documentId,
      version_number: nextVersion,
      storage_path: path,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('documents').update({ updated_at: new Date().toISOString() }).eq('id', documentId)
  await supabaseAdmin.from('document_events').insert({
    tenant_id: profile.tenant_id,
    document_id: documentId,
    user_id: user.id,
    event_type: 'version_uploaded',
    metadata: { version_number: nextVersion, filename: file.name },
  })

  return NextResponse.json({ version })
}
