import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { getValidGraphToken } from '@/lib/microsoft-graph/tokens'
import {
  getMessageMetadata,
  downloadMessageAttachment,
  downloadMessageRaw,
  listMessageAttachments,
  GraphApiError,
} from '@/lib/microsoft-graph/client'
import { createDocumentWithFile, CreateDocumentError } from '@/lib/doctrack/create-document'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Links an Outlook email into DocTrack -- the email itself stays a
// reference (external_source: 'outlook'), never copied into our own
// storage, unless save_copy is explicitly requested. Any selected
// attachments become real, stored DocTrack documents (bytes copied via
// createDocumentWithFile, the same path a regular upload takes).
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'doctrack'))) {
    return NextResponse.json({ error: 'DocTrack is not active for this tenant' }, { status: 403 })
  }

  const { message_id, title, matter_id, category, attachment_ids, save_copy } = await request.json()
  if (!message_id || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'message_id and title are required' }, { status: 400 })
  }

  let matter: { id: string; responsible_lawyer: string | null } | null = null
  if (matter_id) {
    const { data } = await supabaseAdmin
      .from('matters')
      .select('id, responsible_lawyer')
      .eq('id', matter_id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!data) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    matter = data
  }
  if (!canAccessMatterDocument(profile, matter)) {
    return NextResponse.json({ error: 'Not authorized to link documents for this matter' }, { status: 403 })
  }

  const accessToken = await getValidGraphToken(user.id)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Connect (or reconnect) your Microsoft account from My Account to link Outlook emails' },
      { status: 403 }
    )
  }

  let message
  try {
    message = await getMessageMetadata(accessToken, message_id)
  } catch (err) {
    const msg = err instanceof GraphApiError ? err.message : 'Could not read message metadata from Outlook'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { data: emailDocument, error } = await supabaseAdmin
    .from('documents')
    .insert({
      tenant_id: profile.tenant_id,
      matter_id: matter?.id || null,
      title: title.trim(),
      category: typeof category === 'string' && category.trim() ? category.trim() : null,
      created_by: user.id,
      external_source: 'outlook',
      external_item_id: message_id,
      external_web_url: message.webLink,
      external_filename: message.subject,
      external_size_bytes: null,
      external_modified_at: message.receivedDateTime,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('document_events').insert({
    tenant_id: profile.tenant_id,
    document_id: emailDocument.id,
    user_id: user.id,
    event_type: 'created',
    metadata: { source: 'outlook_email', from: message.from, subject: message.subject },
  })

  const attachmentDocuments: unknown[] = []
  if (Array.isArray(attachment_ids) && attachment_ids.length) {
    let available
    try {
      available = await listMessageAttachments(accessToken, message_id)
    } catch (err) {
      const msg = err instanceof GraphApiError ? err.message : 'Could not read attachments from Outlook'
      return NextResponse.json({ error: msg, emailDocument }, { status: 502 })
    }
    const byId = new Map(available.map((a) => [a.id, a]))

    for (const attachmentId of attachment_ids) {
      const meta = byId.get(attachmentId)
      if (!meta) continue
      try {
        const fileBuffer = await downloadMessageAttachment(accessToken, message_id, attachmentId)
        const { document, version } = await createDocumentWithFile({
          tenantId: profile.tenant_id,
          matterId: matter?.id || null,
          title: meta.name,
          category: typeof category === 'string' && category.trim() ? category.trim() : null,
          createdBy: user.id,
          fileBuffer,
          filename: meta.name,
          mimeType: meta.contentType,
          sizeBytes: meta.size,
          eventMetadata: { source: 'outlook_attachment', message_id, message_subject: message.subject },
        })
        attachmentDocuments.push({ ...document, latest_version: version })
      } catch (err) {
        const msg = err instanceof GraphApiError || err instanceof CreateDocumentError ? err.message : 'Could not import attachment'
        return NextResponse.json({ error: msg, emailDocument, attachmentDocuments }, { status: 502 })
      }
    }
  }

  let copyDocument
  if (save_copy) {
    try {
      const fileBuffer = await downloadMessageRaw(accessToken, message_id)
      const { document, version } = await createDocumentWithFile({
        tenantId: profile.tenant_id,
        matterId: matter?.id || null,
        title: `${message.subject} (saved copy)`,
        category: typeof category === 'string' && category.trim() ? category.trim() : null,
        createdBy: user.id,
        fileBuffer,
        filename: `${message.subject}.eml`,
        mimeType: 'message/rfc822',
        sizeBytes: fileBuffer.byteLength,
        eventMetadata: { source: 'outlook_email_copy', message_id },
      })
      copyDocument = { ...document, latest_version: version }
    } catch (err) {
      const msg = err instanceof GraphApiError || err instanceof CreateDocumentError ? err.message : 'Could not save a copy of the email'
      return NextResponse.json({ error: msg, emailDocument, attachmentDocuments }, { status: 502 })
    }
  }

  return NextResponse.json({ emailDocument, attachmentDocuments, copyDocument })
}
