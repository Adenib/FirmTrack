import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { assertPeriodOpen, postJournalEntry, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
  return `INV-${year}-${String((count || 0) + 1).padStart(4, '0')}`
}

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

  const entryIds = Array.isArray(time_entry_ids) ? time_entry_ids : []
  const disbIds = Array.isArray(disbursement_ids) ? disbursement_ids : []

  if (entryIds.length === 0 && disbIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one time entry or disbursement to bill' }, { status: 400 })
  }

  const [entriesRes, disbursementsRes] = await Promise.all([
    entryIds.length > 0
      ? supabaseAdmin
          .from('time_entries')
          .select('id, amount_usd')
          .eq('tenant_id', profile.tenant_id)
          .eq('matter_id', matter_id)
          .eq('billable', true)
          .in('status', ['draft', 'submitted'])
          .in('id', entryIds)
      : Promise.resolve({ data: [] as { id: string; amount_usd: number }[] }),
    disbIds.length > 0
      ? supabaseAdmin
          .from('disbursements')
          .select('id, amount_usd')
          .eq('tenant_id', profile.tenant_id)
          .eq('matter_id', matter_id)
          .eq('billed', false)
          .in('id', disbIds)
      : Promise.resolve({ data: [] as { id: string; amount_usd: number }[] }),
  ])

  const entries = entriesRes.data || []
  const disbursements = disbursementsRes.data || []

  if (entries.length === 0 && disbursements.length === 0) {
    return NextResponse.json({ error: 'None of the selected items are still unbilled' }, { status: 400 })
  }

  const feesAmount = entries.reduce((sum, e) => sum + Number(e.amount_usd || 0), 0)
  const disbursementsAmount = disbursements.reduce((sum, d) => sum + Number(d.amount_usd || 0), 0)
  const invoiceNumber = await generateInvoiceNumber(profile.tenant_id)
  const invoiceDate = new Date().toISOString().split('T')[0]

  try {
    await assertPeriodOpen(profile.tenant_id, invoiceDate)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from('invoices')
    .insert({
      tenant_id: profile.tenant_id,
      matter_id,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: due_date || null,
      fees_amount_usd: feesAmount,
      disbursements_amount_usd: disbursementsAmount,
      total_amount_usd: feesAmount + disbursementsAmount,
      status: 'open',
      created_by: user.id,
    })
    .select()
    .single()

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: invoiceError?.message || 'Failed to create invoice' }, { status: 500 })
  }

  try {
    await postJournalEntry({
      tenantId: profile.tenant_id,
      entryDate: invoiceDate,
      description: `Invoice ${invoiceNumber} created`,
      sourceType: 'invoice_created',
      sourceId: invoice.id,
      createdBy: user.id,
      lines: [
        { accountKey: 'accounts_receivable', matterId: matter_id, debitUsd: feesAmount + disbursementsAmount },
        { accountKey: 'fees_earned', matterId: matter_id, creditUsd: feesAmount },
        { accountKey: 'client_costs_advanced', matterId: matter_id, creditUsd: disbursementsAmount },
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: `Invoice created but GL posting failed: ${(err as Error).message}` }, { status: 500 })
  }

  if (entries.length > 0) {
    await supabaseAdmin
      .from('time_entries')
      .update({ status: 'billed', invoice_id: invoice.id })
      .in('id', entries.map((e) => e.id))
  }

  if (disbursements.length > 0) {
    await supabaseAdmin
      .from('disbursements')
      .update({ billed: true, invoice_id: invoice.id })
      .in('id', disbursements.map((d) => d.id))
  }

  return NextResponse.json({ invoice })
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

  const { id, payment_amount_usd, void: voidInvoice } = await request.json()
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
    if (Number(invoice.paid_amount_usd || 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot void an invoice with recorded payments — refund the payment first' },
        { status: 400 }
      )
    }
    updates.status = 'void'
  } else if (payment_amount_usd) {
    const newPaid = Number(invoice.paid_amount_usd || 0) + Number(payment_amount_usd)
    updates.paid_amount_usd = newPaid
    updates.status = newPaid >= Number(invoice.total_amount_usd || 0) ? 'paid' : 'partially_paid'
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
          { accountKey: 'fees_earned', matterId: invoice.matter_id, debitUsd: Number(invoice.fees_amount_usd || 0) },
          { accountKey: 'client_costs_advanced', matterId: invoice.matter_id, debitUsd: Number(invoice.disbursements_amount_usd || 0) },
          { accountKey: 'accounts_receivable', matterId: invoice.matter_id, creditUsd: Number(invoice.total_amount_usd || 0) },
        ],
      })
    } else if (payment_amount_usd) {
      await postJournalEntry({
        tenantId: profile.tenant_id,
        entryDate: today,
        description: `Payment received on invoice ${invoice.invoice_number}`,
        sourceType: 'invoice_payment',
        sourceId: invoice.id,
        createdBy: user.id,
        lines: [
          { accountKey: 'operating_cash', matterId: invoice.matter_id, debitUsd: Number(payment_amount_usd) },
          { accountKey: 'accounts_receivable', matterId: invoice.matter_id, creditUsd: Number(payment_amount_usd) },
        ],
      })
    }
  } catch (err) {
    return NextResponse.json({ error: `Invoice updated but GL posting failed: ${(err as Error).message}` }, { status: 500 })
  }

  return NextResponse.json({ invoice: data })
}
