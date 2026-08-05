import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'request-attachments'
const GRIEVANCE_PRIVILEGED = ['owner', 'admin', 'hr']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
}

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// Same visibility rule GET /api/hrtrack/requests applies -- a grievance's
// attachment is exactly as sensitive as the grievance itself.
function canView(existing: { type: string; user_id: string }, userId: string, role: string) {
  if (existing.type !== 'grievance') return true
  return existing.user_id === userId || GRIEVANCE_PRIVILEGED.includes(role)
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const formData = await request.formData()
  const requestId = formData.get('request_id')
  const file = formData.get('file')
  if (typeof requestId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'request_id and file are required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('requests')
    .select('id, tenant_id, user_id, type, attachment')
    .eq('id', requestId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Only the submitter attaches their own evidence -- a reviewer's input
  // is reviewer_notes, not a file uploaded on someone else's behalf.
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'You can only attach evidence to your own request' }, { status: 403 })
  }

  const extension = ALLOWED_TYPES[file.type]
  if (!extension) {
    return NextResponse.json({ error: 'Only PDF, Word (.doc/.docx), and JPEG files are allowed' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be 10MB or smaller' }, { status: 400 })
  }

  // Replace any previous attachment for this request rather than
  // accumulating orphaned objects in storage.
  const previousPath = (existing.attachment as { path?: string } | null)?.path
  if (previousPath) {
    await supabaseAdmin.storage.from(BUCKET).remove([previousPath])
  }

  const path = `${profile.tenant_id}/${requestId}/${Date.now()}.${extension}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const attachment = {
    path,
    filename: file.name,
    mime_type: file.type,
    size: file.size,
    uploaded_at: new Date().toISOString(),
  }

  const { data: updated, error } = await supabaseAdmin
    .from('requests')
    .update({ attachment, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: updated })
}

// Returns a short-lived signed URL rather than exposing the bucket path
// directly -- the bucket is private, so this is the only way to view the
// file, and it lets us apply the grievance-visibility check per request.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const requestId = searchParams.get('request_id')
  if (!requestId) return NextResponse.json({ error: 'request_id is required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('requests')
    .select('id, tenant_id, user_id, type, attachment')
    .eq('id', requestId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (!canView(existing, user.id, profile.role)) {
    return NextResponse.json({ error: 'Not authorized to view this request' }, { status: 403 })
  }

  const attachment = existing.attachment as { path?: string; filename?: string } | null
  if (!attachment?.path) return NextResponse.json({ error: 'No attachment on this request' }, { status: 404 })

  const { data: signed, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(attachment.path, 300)
  if (error || !signed) return NextResponse.json({ error: error?.message || 'Could not sign URL' }, { status: 500 })

  return NextResponse.json({ url: signed.signedUrl, filename: attachment.filename })
}

export async function DELETE(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { requestId } = await request.json()
  if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('requests')
    .select('id, tenant_id, user_id, attachment')
    .eq('id', requestId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'You can only remove your own evidence' }, { status: 403 })
  }

  const path = (existing.attachment as { path?: string } | null)?.path
  if (path) await supabaseAdmin.storage.from(BUCKET).remove([path])

  const { error } = await supabaseAdmin
    .from('requests')
    .update({ attachment: null, updated_at: new Date().toISOString() })
    .eq('id', requestId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
