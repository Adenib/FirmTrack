import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_SIZE, ALLOWED_DOCUMENT_TYPES } from '@/lib/doctrack/constants'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DOCUMENT_TYPES = ['cac', 'tin', 'bank_details', 'other']

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

async function hasVendorAccess(tenantId: string): Promise<boolean> {
  return (await hasActiveModule(tenantId, 'procuretrack')) || (await hasActiveModule(tenantId, 'assettrack'))
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: vendorId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasVendorAccess(profile.tenant_id))) {
    return NextResponse.json({ error: 'ProcureTrack/AssetTrack is not active for this tenant' }, { status: 403 })
  }

  const { data: documents, error } = await supabaseAdmin
    .from('vendor_documents')
    .select('*')
    .eq('vendor_id', vendorId)
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documents })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: vendorId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasVendorAccess(profile.tenant_id))) {
    return NextResponse.json({ error: 'ProcureTrack/AssetTrack is not active for this tenant' }, { status: 403 })
  }
  if (!PROCURETRACK_APPROVER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager access required' }, { status: 403 })
  }

  const { data: vendor } = await supabaseAdmin
    .from('vendors')
    .select('id')
    .eq('id', vendorId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const formData = await request.formData()
  const documentType = formData.get('document_type')
  const file = formData.get('file')
  if (typeof documentType !== 'string' || !DOCUMENT_TYPES.includes(documentType)) {
    return NextResponse.json({ error: `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (!ALLOWED_DOCUMENT_TYPES[file.type]) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    return NextResponse.json({ error: 'File must be 25MB or smaller' }, { status: 400 })
  }

  const path = `${profile.tenant_id}/vendors/${vendorId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: document, error } = await supabaseAdmin
    .from('vendor_documents')
    .insert({
      tenant_id: profile.tenant_id,
      vendor_id: vendorId,
      document_type: documentType,
      storage_path: path,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ document }, { status: 201 })
}
