import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { DOCUMENTS_BUCKET } from '@/lib/doctrack/constants'
import { extractDocumentText, UnsupportedDocumentTypeError } from '@/lib/ai/extract-document-text'
import { reviewTabularFields, AiTabularReviewError, type TabularField, type TabularFieldValue } from '@/lib/ai/tabular-review'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Several sequential Claude calls (one per document) in one request --
// same reasoning as the inbox-digest cron's maxDuration.
export const maxDuration = 300

const MAX_DOCUMENTS_PER_BATCH = 15

function validFields(fields: unknown): fields is TabularField[] {
  if (!Array.isArray(fields) || fields.length === 0) return false
  return fields.every((f: unknown) => {
    if (!f || typeof f !== 'object') return false
    const field = f as Record<string, unknown>
    return typeof field.label === 'string' && field.label.trim() !== '' && typeof field.instructions === 'string' && field.instructions.trim() !== ''
  })
}

type Profile = { id: string; tenant_id: string; role: string }

// Processes one document: load, authz-check, extract, call the AI
// transport. Never throws -- any failure becomes a row shape with
// `error` set, so one bad document never aborts the batch.
async function processDocument(
  profile: Profile,
  documentId: string,
  fields: TabularField[]
): Promise<{ document_id: string | null; document_title: string; values: TabularFieldValue[] | null; error: string | null }> {
  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*, matters(id, case_name, responsible_lawyer)')
    .eq('id', documentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  if (!document) return { document_id: null, document_title: '(unknown document)', values: null, error: 'Document not found' }

  if (!canAccessMatterDocument(profile, document.matters as { responsible_lawyer: string | null } | null)) {
    return { document_id: document.id, document_title: document.title, values: null, error: 'Not authorized to review this document' }
  }
  if (document.external_source) {
    return { document_id: document.id, document_title: document.title, values: null, error: 'Linked documents (OneDrive/Outlook) are not supported for review -- only documents uploaded to FirmTrack.' }
  }

  const { data: version } = await supabaseAdmin
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!version) return { document_id: document.id, document_title: document.title, values: null, error: 'This document has no uploaded file to review' }

  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .download(version.storage_path)
  if (downloadError || !fileBlob) {
    return { document_id: document.id, document_title: document.title, values: null, error: downloadError?.message || 'Could not read the document file' }
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer())

  let text: string
  try {
    text = await extractDocumentText(buffer, version.mime_type)
  } catch (err) {
    if (err instanceof UnsupportedDocumentTypeError) {
      return { document_id: document.id, document_title: document.title, values: null, error: err.message }
    }
    return { document_id: document.id, document_title: document.title, values: null, error: `Could not read this document's content: ${(err as Error).message}` }
  }
  if (!text.trim()) {
    return { document_id: document.id, document_title: document.title, values: null, error: 'No readable text was found in this document -- it may be empty, image-only, or corrupted.' }
  }

  try {
    const result = await reviewTabularFields({ documentTitle: document.title, documentText: text, fields })
    return { document_id: document.id, document_title: document.title, values: result.values, error: null }
  } catch (err) {
    const message = err instanceof AiTabularReviewError ? err.message : 'AI tabular review failed'
    return { document_id: document.id, document_title: document.title, values: null, error: message }
  }
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: reviews, error } = await supabaseAdmin
    .from('ai_tabular_reviews')
    .select('id, name, fields, created_at, rows:ai_tabular_review_rows(count)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reviews })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'aitrack'))) {
    return NextResponse.json({ error: 'AITrack is not active for this tenant' }, { status: 403 })
  }

  const { name, fields, document_ids } = await request.json()
  if (!validFields(fields)) {
    return NextResponse.json({ error: 'fields must be a non-empty array of { label, instructions }' }, { status: 400 })
  }
  if (!Array.isArray(document_ids) || document_ids.length === 0) {
    return NextResponse.json({ error: 'document_ids must be a non-empty array' }, { status: 400 })
  }
  if (document_ids.length > MAX_DOCUMENTS_PER_BATCH) {
    return NextResponse.json({ error: `A batch can review at most ${MAX_DOCUMENTS_PER_BATCH} documents at once` }, { status: 400 })
  }

  const { data: review, error: insertError } = await supabaseAdmin
    .from('ai_tabular_reviews')
    .insert({ tenant_id: profile.tenant_id, name: name || null, fields, created_by: user.id })
    .select()
    .single()
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const rows = []
  for (const documentId of document_ids as string[]) {
    const result = await processDocument(profile, documentId, fields)

    const { data: row, error: rowError } = await supabaseAdmin
      .from('ai_tabular_review_rows')
      .insert({
        tenant_id: profile.tenant_id,
        tabular_review_id: review.id,
        document_id: result.document_id,
        document_title: result.document_title,
        values: result.values,
        error: result.error,
      })
      .select()
      .single()
    if (rowError) continue
    rows.push(row)

    if (!result.error && result.document_id) {
      await supabaseAdmin.from('document_events').insert({
        tenant_id: profile.tenant_id,
        document_id: result.document_id,
        user_id: user.id,
        event_type: 'ai_reviewed',
        metadata: { tabular_review_id: review.id },
      })
    }
  }

  return NextResponse.json({ review, rows })
}
