import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { PROCURETRACK_AP_ROLES } from '@/lib/procuretrack/roles'
import { assertPeriodOpen, postJournalEntry, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'
import { logProcuretrackEvent } from '@/lib/procuretrack/audit-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const invoiceId = searchParams.get('invoice_id')

  let query = supabaseAdmin
    .from('procuretrack_payments')
    .select('*, invoice:invoice_id(invoice_number)')
    .eq('tenant_id', profile.tenant_id)
    .order('paid_at', { ascending: false })
  if (invoiceId) query = query.eq('invoice_id', invoiceId)

  const { data: payments, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ payments })
}

// Requires the invoice to be matched/approved -- never pays a
// mismatched invoice that AP hasn't explicitly reviewed. Posts a real
// journal entry (debit operating_expenses, credit operating_cash) via
// postJournalEntry(), the same single ledger-write path every other
// money-movement route in this codebase uses, then flips the invoice to
// 'paid' once it's fully covered.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'procuretrack'))) {
    return NextResponse.json({ error: 'ProcureTrack is not active for this tenant' }, { status: 403 })
  }
  if (!PROCURETRACK_AP_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Accounts/owner/admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { invoice_id, payment_method, reference } = body
  if (!invoice_id) return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 })

  const { data: invoice } = await supabaseAdmin
    .from('procuretrack_invoices')
    .select('id, status, total_amount, invoice_number')
    .eq('id', invoice_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (!['matched', 'approved'].includes(invoice.status)) {
    return NextResponse.json({ error: 'Only a matched or AP-approved invoice can be paid' }, { status: 400 })
  }

  const { data: priorPayments } = await supabaseAdmin
    .from('procuretrack_payments')
    .select('amount')
    .eq('invoice_id', invoice_id)
  const alreadyPaid = (priorPayments || []).reduce((sum, p) => sum + Number(p.amount), 0)
  const remaining = Math.round((Number(invoice.total_amount) - alreadyPaid) * 100) / 100
  if (remaining <= 0) return NextResponse.json({ error: 'This invoice is already fully paid' }, { status: 400 })

  const amount = body.amount != null ? Number(body.amount) : remaining
  if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.005) {
    return NextResponse.json({ error: `amount must be between 0 and the remaining balance (${remaining})` }, { status: 400 })
  }

  const paymentDate = new Date().toISOString().slice(0, 10)
  try {
    await assertPeriodOpen(profile.tenant_id, paymentDate)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  let journalEntryId: string
  try {
    journalEntryId = await postJournalEntry({
      tenantId: profile.tenant_id,
      entryDate: paymentDate,
      description: `Payment on invoice ${invoice.invoice_number}`,
      sourceType: 'procuretrack_payment',
      sourceId: invoice.id,
      createdBy: user.id,
      reference: reference || null,
      lines: [
        { accountKey: 'operating_expenses', debit: amount },
        { accountKey: 'operating_cash', credit: amount },
      ],
    })
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  const { data: payment, error } = await supabaseAdmin
    .from('procuretrack_payments')
    .insert({
      tenant_id: profile.tenant_id,
      invoice_id,
      amount,
      paid_by: user.id,
      journal_entry_id: journalEntryId,
      payment_method: payment_method || null,
      reference: reference || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fullyPaid = alreadyPaid + amount >= Number(invoice.total_amount) - 0.005
  if (fullyPaid) {
    await supabaseAdmin
      .from('procuretrack_invoices')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', invoice_id)
  }

  await logProcuretrackEvent({
    tenantId: profile.tenant_id, documentType: 'payment', documentId: payment.id,
    userId: user.id, eventType: 'posted', metadata: { invoice_id, amount, journal_entry_id: journalEntryId, fully_paid: fullyPaid },
  })

  return NextResponse.json({ payment }, { status: 201 })
}
