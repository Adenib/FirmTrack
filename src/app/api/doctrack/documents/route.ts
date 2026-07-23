import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { MAX_DOCUMENT_SIZE, ALLOWED_DOCUMENT_TYPES } from '@/lib/doctrack/constants'
import { createDocumentWithFile, CreateDocumentError } from '@/lib/doctrack/create-document'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('id, tenant_id, role').eq('id', userId).single()
  return data
}

// Every candidate row's matter (if any) is fetched alongside it so
// canAccessMatterDocument can filter in application code -- this app's
// established pattern (service-role reads + app-code enforcement, not
// RLS) rather than a database-level policy.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'doctrack'))) {
    return NextResponse.json({ error: 'DocTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const matterId = searchParams.get('matter_id')
  const category = searchParams.get('category')

  let query = supabaseAdmin
    .from('documents')
    .select('*, matters(id, matter_id, case_name, responsible_lawyer)')
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (matterId) query = query.eq('matter_id', matterId)
  if (category) query = query.eq('category', category)
  if (q) query = query.ilike('title', `%${q}%`)

  const { data: documents, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const visible = (documents || []).filter((doc) =>
    canAccessMatterDocument(profile, doc.matters as { responsible_lawyer: string | null } | null)
  )

  const documentIds = visible.map((d) => d.id)
  const { data: versions } = documentIds.length
    ? await supabaseAdmin
        .from('document_versions')
        .select('*')
        .in('document_id', documentIds)
        .order('version_number', { ascending: false })
    : { data: [] }

  const latestByDocument = new Map<string, NonNullable<typeof versions>[number]>()
  for (const v of versions || []) {
    if (!latestByDocument.has(v.document_id)) latestByDocument.set(v.document_id, v)
  }

  return NextResponse.json({
    documents: visible.map((doc) => ({ ...doc, latest_version: latestByDocument.get(doc.id) || null })),
  })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'doctrack'))) {
    return NextResponse.json({ error: 'DocTrack is not active for this tenant' }, { status: 403 })
  }

  const formData = await request.formData()
  const title = formData.get('title')
  const matterId = formData.get('matter_id')
  const category = formData.get('category')
  const file = formData.get('file')

  if (typeof title !== 'string' || !title.trim() || !(file instanceof File)) {
    return NextResponse.json({ error: 'title and file are required' }, { status: 400 })
  }

  let matter: { id: string; responsible_lawyer: string | null } | null = null
  if (typeof matterId === 'string' && matterId) {
    const { data } = await supabaseAdmin
      .from('matters')
      .select('id, responsible_lawyer')
      .eq('id', matterId)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!data) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    matter = data
  }
  if (!canAccessMatterDocument(profile, matter)) {
    return NextResponse.json({ error: 'Not authorized to upload documents for this matter' }, { status: 403 })
  }

  if (!ALLOWED_DOCUMENT_TYPES[file.type]) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    return NextResponse.json({ error: 'File must be 25MB or smaller' }, { status: 400 })
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer())

  try {
    const { document, version } = await createDocumentWithFile({
      tenantId: profile.tenant_id,
      matterId: matter?.id || null,
      title: title.trim(),
      category: typeof category === 'string' && category.trim() ? category.trim() : null,
      createdBy: user.id,
      fileBuffer,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })
    return NextResponse.json({ document: { ...document, latest_version: version } })
  } catch (err) {
    const status = err instanceof CreateDocumentError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Could not create document'
    return NextResponse.json({ error: message }, { status })
  }
}
