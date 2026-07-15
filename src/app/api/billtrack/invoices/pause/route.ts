import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { canManageInvoice } from '@/lib/billtrack/permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Toggles reminders_paused on an invoice. Pausing stops Stage 2's daily
// cron from sending further reminders for it (manual Send Now still works
// either way) until a lawyer/admin/accounts user resumes it or the
// invoice is paid/voided.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'billtrack'))) {
    return NextResponse.json({ error: 'BillTrack is not active for this tenant' }, { status: 403 })
  }

  const { invoice_id, paused } = await request.json()
  if (!invoice_id || typeof paused !== 'boolean') {
    return NextResponse.json({ error: 'invoice_id and paused (boolean) are required' }, { status: 400 })
  }

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, matters(responsible_lawyer)')
    .eq('id', invoice_id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const matter = Array.isArray(invoice.matters) ? invoice.matters[0] : invoice.matters
  if (!canManageInvoice({ id: user.id, role: profile.role }, matter || { responsible_lawyer: null })) {
    return NextResponse.json({ error: 'Not authorized to pause reminders on this invoice' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({
      reminders_paused: paused,
      reminders_paused_by: paused ? user.id : null,
      reminders_paused_at: paused ? new Date().toISOString() : null,
    })
    .eq('id', invoice_id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
