import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { assertPeriodOpen, postJournalEntry, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'
import { createInvoiceForMatter, InvoiceCreationError } from '@/lib/accounttrack/create-invoice'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matter_id')

  let query = supabaseAdmin
    .from('invoices')
    .select('*, matters(matter_id, case_name)')
    .eq('tenant_id', profile.tenant_id)
    .order('invoice_date', { ascending: false })

  if (matterId) query = query.eq('matter_id', matterId)

  const { data: invoices, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices })
}

// Creates an invoice from caller-selected unbilled time entries and/or
// disbursements, then flips those rows to billed so Unbilled Fees and A/R
// stay mutually consistent instead of two independently-tracked numbers.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { matter_id, due_date, time_entry_ids, disbursement_ids } = await request.json()
  if (!matter_id) return NextResponse.json({ error: 'matter_id is required' }, { status: 400 })

  try {
    const invoice = await createInvoiceForMatter({
      tenantId: profile.tenant_id,
      matterId: matter_id,
      dueDate: due_date,
      timeEntryIds: time_entry_ids,
      disbursementIds: disbursement_ids,
      createdBy: user.id,
    })
    return NextResponse.json({ invoice })
  } catch (err) {
    if (err instanceof InvoiceCreationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}

// Records a payment against an invoice and recomputes its status.
export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { id, payment_amount, void: voidInvoice } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const today = new Date().toISOString().split('T')[0]

  try {
    await assertPeriodOpen(profile.tenant_id, today)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (voidInvoice) {
    if (Number(invoice.paid_amount || 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot void an invoice with recorded payments — refund the payment first' },
        { status: 400 }
      )
    }
    updates.status = 'void'
  } else if (payment_amount) {
    const newPaid = Number(invoice.paid_amount || 0) + Number(payment_amount)
    updates.paid_amount = newPaid
    updates.status = newPaid >= Number(invoice.total_amount || 0) ? 'paid' : 'partially_paid'
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    if (voidInvoice) {
      await postJournalEntry({
        tenantId: profile.tenant_id,
        entryDate: today,
        description: `Invoice ${invoice.invoice_number} voided`,
        sourceType: 'invoice_void',
        sourceId: invoice.id,
        createdBy: user.id,
        lines: [
          { accountKey: 'fees_earned', matterId: invoice.matter_id, debit: Number(invoice.fees_amount || 0) },
          { accountKey: 'client_costs_advanced', matterId: invoice.matter_id, debit: Number(invoice.disbursements_amount || 0) },
          { accountKey: 'accounts_receivable', matterId: invoice.matter_id, credit: Number(invoice.total_amount || 0) },
        ],
      })
    } else if (payment_amount) {
      await postJournalEntry({
        tenantId: profile.tenant_id,
        entryDate: today,
        description: `Payment received on invoice ${invoice.invoice_number}`,
        sourceType: 'invoice_payment',
        sourceId: invoice.id,
        createdBy: user.id,
        lines: [
          { accountKey: 'operating_cash', matterId: invoice.matter_id, debit: Number(payment_amount) },
          { accountKey: 'accounts_receivable', matterId: invoice.matter_id, credit: Number(payment_amount) },
        ],
      })
    }
  } catch (err) {
    return NextResponse.json({ error: `Invoice updated but GL posting failed: ${(err as Error).message}` }, { status: 500 })
  }

  return NextResponse.json({ invoice: data })
}
