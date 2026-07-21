import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('id, tenant_id, role').eq('id', userId).single()
  return data
}

async function loadDocument(id: string, tenantId: string) {
  return supabaseAdmin
    .from('documents')
    .select('*, matters(id, matter_id, case_name, responsible_lawyer)')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()
}

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: document } = await loadDocument(id, profile.tenant_id)
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!canAccessMatterDocument(profile, document.matters as { responsible_lawyer: string | null } | null)) {
    return NextResponse.json({ error: 'Not authorized to view this document' }, { status: 403 })
  }

  const { data: versions } = await supabaseAdmin
    .from('document_versions')
    .select('*')
    .eq('document_id', id)
    .order('version_number', { ascending: false })

  await supabaseAdmin.from('document_events').insert({
    tenant_id: profile.tenant_id,
    document_id: id,
    user_id: user.id,
    event_type: 'viewed',
    metadata: {},
  })

  return NextResponse.json({ document: { ...document, versions: versions || [] } })
}

// Soft delete only -- never removes the storage objects or version
// rows. Restricted to the uploader or owner/admin.
export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: document } = await loadDocument(id, profile.tenant_id)
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!canAccessMatterDocument(profile, document.matters as { responsible_lawyer: string | null } | null)) {
    return NextResponse.json({ error: 'Not authorized to delete this document' }, { status: 403 })
  }
  if (document.created_by !== user.id && !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only the uploader or an admin can delete this document' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('document_events').insert({
    tenant_id: profile.tenant_id,
    document_id: id,
    user_id: user.id,
    event_type: 'deleted',
    metadata: {},
  })

  return NextResponse.json({ success: true })
}
