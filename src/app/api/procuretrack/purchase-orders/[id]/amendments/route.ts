import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'
import { logProcuretrackEvent } from '@/lib/procuretrack/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Top-level PO fields an amendment may change. Line-item changes are out
// of scope for v1 -- an amendment that needs different items is raised as
// a new PO instead.
const AMENDABLE_FIELDS = ['vendor_id', 'department_id', 'total_amount', 'currency'] as const

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: poId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }

  const { data: amendments, error } = await supabaseAdmin
    .from('procuretrack_po_amendments')
    .select('*')
    .eq('po_id', poId)
    .eq('tenant_id', profile.tenant_id)
    .order('amendment_number', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ amendments })
}

// An issued PO is never edited in place -- every change past 'issued' is
// a new amendments row (recording exactly what changed and why) alongside
// the updated PO fields, applied in the same request.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: poId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!PROCURETRACK_APPROVER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager access required' }, { status: 403 })
  }

  const body = await request.json()
  const { changes, reason } = body
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'changes (an object of fields to update) is required' }, { status: 400 })
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  const invalidField = Object.keys(changes).find((f) => !AMENDABLE_FIELDS.includes(f as typeof AMENDABLE_FIELDS[number]))
  if (invalidField) {
    return NextResponse.json({ error: `"${invalidField}" cannot be amended -- supported fields: ${AMENDABLE_FIELDS.join(', ')}` }, { status: 400 })
  }

  const { data: po } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('id, status')
    .eq('id', poId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  if (!['issued', 'partially_received'].includes(po.status)) {
    return NextResponse.json({ error: 'Only an issued or partially-received PO can be amended' }, { status: 400 })
  }

  const { count } = await supabaseAdmin
    .from('procuretrack_po_amendments')
    .select('id', { count: 'exact', head: true })
    .eq('po_id', poId)
  const amendmentNumber = (count || 0) + 1

  const { data: amendment, error: amendmentError } = await supabaseAdmin
    .from('procuretrack_po_amendments')
    .insert({
      tenant_id: profile.tenant_id,
      po_id: poId,
      amendment_number: amendmentNumber,
      changes,
      reason: reason.trim(),
      created_by: user.id,
    })
    .select()
    .single()
  if (amendmentError) return NextResponse.json({ error: amendmentError.message }, { status: 400 })

  const { data: updatedPo, error: updateError } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', poId)
    .select()
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'po', documentId: poId,
    userId: user.id, eventType: 'amended', metadata: { amendment_number: amendmentNumber, changes, reason: reason.trim() },
  })

  return NextResponse.json({ amendment, po: updatedPo }, { status: 201 })
}
