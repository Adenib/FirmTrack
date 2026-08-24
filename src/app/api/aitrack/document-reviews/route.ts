import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { DOCUMENTS_BUCKET } from '@/lib/doctrack/constants'
import { extractDocumentText, UnsupportedDocumentTypeError } from '@/lib/ai/extract-document-text'
import { reviewDocument, AiDocumentReviewError, MODEL } from '@/lib/ai/document-review'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const documentId = searchParams.get('document_id')
  if (!documentId) return NextResponse.json({ error: 'document_id is required' }, { status: 400 })

  const { data: reviews, error } = await supabaseAdmin
    .from('ai_document_reviews')
    .select('*, reviewer:reviewed_by(email), playbook:playbook_id(name)')
    .eq('tenant_id', profile.tenant_id)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reviews })
}

// Runs a fresh AI review of a document's latest version. Extracted text
// is never persisted -- re-extracted from storage on every run and kept
// in memory only for this request.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'aitrack'))) {
    return NextResponse.json({ error: 'AITrack is not active for this tenant' }, { status: 403 })
  }

  const { document_id, playbook_id } = await request.json()
  if (!document_id) return NextResponse.json({ error: 'document_id is required' }, { status: 400 })

  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*, matters(id, case_name, responsible_lawyer)')
    .eq('id', document_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!canAccessMatterDocument(profile, document.matters as { responsible_lawyer: string | null } | null)) {
    return NextResponse.json({ error: 'Not authorized to review this document' }, { status: 403 })
  }
  if (document.external_source) {
    return NextResponse.json(
      { error: 'AI Document Review is not available for linked OneDrive/Outlook documents -- only documents uploaded to FirmTrack.' },
      { status: 400 }
    )
  }

  const { data: version } = await supabaseAdmin
    .from('document_versions')
    .select('*')
    .eq('document_id', document_id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()
  if (!version) return NextResponse.json({ error: 'This document has no uploaded file to review' }, { status: 400 })

  let playbook: { name: string; rules: { label: string; instructions: string }[] } | null = null
  if (playbook_id) {
    const { data: pb } = await supabaseAdmin
      .from('ai_playbooks')
      .select('name, rules')
      .eq('id', playbook_id)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle()
    if (!pb) return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
    playbook = pb
  }

  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .download(version.storage_path)
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: downloadError?.message || 'Could not read the document file' }, { status: 500 })
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer())

  let text: string
  try {
    text = await extractDocumentText(buffer, version.mime_type)
  } catch (err) {
    if (err instanceof UnsupportedDocumentTypeError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: `Could not read this document's content: ${(err as Error).message}` }, { status: 500 })
  }
  if (!text.trim()) {
    return NextResponse.json({ error: 'No readable text was found in this document -- it may be empty, image-only, or corrupted.' }, { status: 400 })
  }

  try {
    const result = await reviewDocument({
      documentTitle: document.title,
      matterCaseName: document.matters?.case_name || 'this matter',
      documentText: text,
      playbookRules: playbook?.rules,
    })

    const { data: review, error: insertError } = await supabaseAdmin
      .from('ai_document_reviews')
      .insert({
        tenant_id: profile.tenant_id,
        document_id,
        document_version_id: version.id,
        playbook_id: playbook_id || null,
        reviewed_by: user.id,
        summary: result.summary,
        key_terms: result.keyTerms,
        key_dates: result.keyDates,
        risk_flags: result.riskFlags,
        playbook_results: result.playbookResults,
        model: MODEL,
      })
      .select()
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    await supabaseAdmin.from('document_events').insert({
      tenant_id: profile.tenant_id,
      document_id,
      user_id: user.id,
      event_type: 'ai_reviewed',
      metadata: { review_id: review.id, playbook_id: playbook_id || null },
    })

    return NextResponse.json({ review })
  } catch (err) {
    if (err instanceof AiDocumentReviewError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI document review failed' }, { status: 500 })
  }
}
