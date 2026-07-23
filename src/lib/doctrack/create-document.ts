import { createClient } from '@supabase/supabase-js'
import { DOCUMENTS_BUCKET } from './constants'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class CreateDocumentError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

// Shared by the regular multipart upload route and anything that
// fetches bytes server-side (Outlook attachments/saved email copies) --
// insert the documents row, upload to storage, insert version 1, log
// the created event. Callers are expected to have already run
// canAccessMatterDocument/hasActiveModule checks; this is pure creation
// logic, not authorization.
export async function createDocumentWithFile(params: {
  tenantId: string
  matterId: string | null
  title: string
  category?: string | null
  createdBy: string
  fileBuffer: Buffer
  filename: string
  mimeType: string
  sizeBytes: number
  eventMetadata?: Record<string, unknown>
}) {
  const { data: document, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      tenant_id: params.tenantId,
      matter_id: params.matterId,
      title: params.title,
      category: params.category || null,
      created_by: params.createdBy,
    })
    .select()
    .single()
  if (docError || !document) {
    throw new CreateDocumentError(docError?.message || 'Could not create document')
  }

  const path = `${params.tenantId}/${document.id}/1-${params.filename}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, params.fileBuffer, { contentType: params.mimeType })
  if (uploadError) {
    await supabaseAdmin.from('documents').delete().eq('id', document.id)
    throw new CreateDocumentError(uploadError.message)
  }

  const { data: version, error: versionError } = await supabaseAdmin
    .from('document_versions')
    .insert({
      document_id: document.id,
      version_number: 1,
      storage_path: path,
      filename: params.filename,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      uploaded_by: params.createdBy,
    })
    .select()
    .single()
  if (versionError) throw new CreateDocumentError(versionError.message)

  await supabaseAdmin.from('document_events').insert({
    tenant_id: params.tenantId,
    document_id: document.id,
    user_id: params.createdBy,
    event_type: 'created',
    metadata: { filename: params.filename, ...params.eventMetadata },
  })

  return { document, version }
}
