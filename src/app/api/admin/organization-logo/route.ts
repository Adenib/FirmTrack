import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { LOGO_BUCKET, MAX_LOGO_SIZE, ALLOWED_LOGO_TYPES } from '@/lib/branding/constants'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 // 24h -- long enough to outlive a single session

async function requireOwnerOrAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { profile }
}

async function signedLogoUrl(logoPath: string | null) {
  if (!logoPath) return null
  const { data } = await supabaseAdmin.storage.from(LOGO_BUCKET).createSignedUrl(logoPath, SIGNED_URL_TTL_SECONDS)
  return data?.signedUrl || null
}

export async function GET() {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('logo_path')
    .eq('id', profile!.tenant_id)
    .single()
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })

  return NextResponse.json({ logoUrl: await signedLogoUrl(org.logo_path) })
}

export async function POST(request: Request) {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: 'Logo must be 2MB or smaller' }, { status: 400 })
  }
  const ext = ALLOWED_LOGO_TYPES[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Logo must be a PNG, JPEG, or WEBP image' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('organizations')
    .select('logo_path')
    .eq('id', profile!.tenant_id)
    .single()

  // Re-uploading with a different format changes the file extension --
  // clean up the old object first so it doesn't linger orphaned.
  if (existing?.logo_path) {
    await supabaseAdmin.storage.from(LOGO_BUCKET).remove([existing.logo_path])
  }

  const path = `${profile!.tenant_id}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabaseAdmin.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: updateError } = await supabaseAdmin
    .from('organizations')
    .update({ logo_path: path })
    .eq('id', profile!.tenant_id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ logoUrl: await signedLogoUrl(path) })
}

export async function DELETE() {
  const { error, profile } = await requireOwnerOrAdmin()
  if (error) return error

  const { data: existing } = await supabaseAdmin
    .from('organizations')
    .select('logo_path')
    .eq('id', profile!.tenant_id)
    .single()

  if (existing?.logo_path) {
    await supabaseAdmin.storage.from(LOGO_BUCKET).remove([existing.logo_path])
  }

  const { error: updateError } = await supabaseAdmin
    .from('organizations')
    .update({ logo_path: null })
    .eq('id', profile!.tenant_id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
