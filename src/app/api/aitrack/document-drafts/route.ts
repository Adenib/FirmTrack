import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { draftDocument, AiDocumentDraftError, MODEL } from '@/lib/ai/document-draft'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tenant-wide readable, same open-read convention as ai_document_reviews
// -- drafting is a working-lawyer tool, not admin config.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matter_id')

  let query = supabaseAdmin
    .from('ai_document_drafts')
    .select('*, author:created_by(email), matters(id, matter_id, case_name)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (matterId) query = query.eq('matter_id', matterId)

  const { data: drafts, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drafts })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'aitrack'))) {
    return NextResponse.json({ error: 'AITrack is not active for this tenant' }, { status: 403 })
  }

  const { document_type, matter_id, prompt } = await request.json()
  if (!document_type || !prompt) {
    return NextResponse.json({ error: 'document_type and prompt are required' }, { status: 400 })
  }

  let matterCaseName: string | null = null
  if (matter_id) {
    const { data: matter } = await supabaseAdmin
      .from('matters')
      .select('case_name')
      .eq('id', matter_id)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle()
    if (!matter) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    matterCaseName = matter.case_name
  }

  try {
    const result = await draftDocument({ documentType: document_type, matterCaseName, prompt })

    const { data: draft, error } = await supabaseAdmin
      .from('ai_document_drafts')
      .insert({
        tenant_id: profile.tenant_id,
        matter_id: matter_id || null,
        document_type,
        prompt,
        content: result.content,
        notes: result.notes,
        model: MODEL,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ draft })
  } catch (err) {
    if (err instanceof AiDocumentDraftError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI document drafting failed' }, { status: 500 })
  }
}
