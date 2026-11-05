import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ProcuretrackDocumentType = 'requisition' | 'po' | 'grn' | 'invoice' | 'payment' | 'vendor' | 'contract'

// One plain insert() right after a mutation, same shape/intent as
// document_events and assettrack_ticket_events -- UPDATE/DELETE are
// revoked on procuretrack_audit_log at the DB level, so this is genuinely
// tamper-proof, not just app convention. Never throws into the caller's
// response path; a logging failure shouldn't fail the mutation it's
// recording.
export async function logProcuretrackEvent(input: {
  tenantId: string
  documentType: ProcuretrackDocumentType
  documentId: string
  userId: string | null
  eventType: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await supabaseAdmin.from('procuretrack_audit_log').insert({
    tenant_id: input.tenantId,
    document_type: input.documentType,
    document_id: input.documentId,
    user_id: input.userId,
    event_type: input.eventType,
    metadata: input.metadata || {},
  })
}
