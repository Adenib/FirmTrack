import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { sendInvoiceEmail, EmailSendError } from '@/lib/billtrack/send-email'
import { canManageInvoice } from '@/lib/billtrack/permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Headless Chromium cold-start + PDF render + Resend upload can take
// several seconds; Vercel's default function duration (10s) cuts it close.
export const maxDuration = 30

// Manually sends (or re-sends) an invoice notification email right now.
// `kind` defaults to 'initial' the first time, 'reminder' otherwise — but
// the caller can always pick, since a lawyer might want to manually
// trigger either regardless of send history.
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

  const { invoice_id, kind } = await request.json()
  if (!invoice_id) return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 })

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, matter_id, matters(responsible_lawyer)')
    .eq('id', invoice_id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const matter = Array.isArray(invoice.matters) ? invoice.matters[0] : invoice.matters
  if (!canManageInvoice({ id: user.id, role: profile.role }, matter || { responsible_lawyer: null })) {
    return NextResponse.json({ error: 'Not authorized to send this invoice' }, { status: 403 })
  }

  try {
    await sendInvoiceEmail(profile.tenant_id, invoice_id, kind === 'reminder' ? 'reminder' : 'initial')
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof EmailSendError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
