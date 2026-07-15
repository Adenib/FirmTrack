import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Firmwide invoice list for BillTrack: same invoices AccountTrack manages,
// joined with matter/client and the most recent send-history row, so the
// UI can show "last sent" / "never sent" without a second round trip.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'billtrack'))) {
    return NextResponse.json({ error: 'BillTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matter_id')
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('invoices')
    .select('*, matters(matter_id, case_name, responsible_lawyer, clients(name, email))')
    .eq('tenant_id', profile.tenant_id)
    .order('invoice_date', { ascending: false })

  if (matterId) query = query.eq('matter_id', matterId)
  if (status) query = query.eq('status', status)

  const { data: invoices, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const invoiceIds = (invoices || []).map((inv) => inv.id)
  const { data: reminders } = invoiceIds.length > 0
    ? await supabaseAdmin
        .from('invoice_reminders')
        .select('invoice_id, kind, status, sent_at')
        .in('invoice_id', invoiceIds)
        .order('sent_at', { ascending: false })
    : { data: [] }

  const lastSentByInvoice = new Map<string, { kind: string; status: string; sent_at: string }>()
  for (const r of reminders || []) {
    if (!lastSentByInvoice.has(r.invoice_id)) lastSentByInvoice.set(r.invoice_id, r)
  }

  const enriched = (invoices || []).map((inv) => ({
    ...inv,
    last_reminder: lastSentByInvoice.get(inv.id) || null,
  }))

  return NextResponse.json({ invoices: enriched })
}
