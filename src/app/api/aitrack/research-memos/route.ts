import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { researchLegalQuestion, AiLegalResearchError, MODEL } from '@/lib/ai/legal-research'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tenant-wide readable, same open-read convention as ai_document_drafts --
// research is a working-lawyer tool, not admin config.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matter_id')

  let query = supabaseAdmin
    .from('ai_research_memos')
    .select('*, author:created_by(email), matters(id, matter_id, case_name)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (matterId) query = query.eq('matter_id', matterId)

  const { data: memos, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ memos })
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

  const { question, matter_id } = await request.json()
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
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
    const result = await researchLegalQuestion({ question, matterCaseName })

    const { data: memo, error } = await supabaseAdmin
      .from('ai_research_memos')
      .insert({
        tenant_id: profile.tenant_id,
        matter_id: matter_id || null,
        question,
        content: result.content,
        sources: result.sources,
        notes: result.notes,
        model: MODEL,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ memo })
  } catch (err) {
    if (err instanceof AiLegalResearchError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI legal research failed' }, { status: 500 })
  }
}
