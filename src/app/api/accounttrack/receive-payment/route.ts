import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { assertPeriodOpen, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'
import { applyInvoicePayment, InvoiceCreationError } from '@/lib/accounttrack/create-invoice'
import { postTrustLedgerEntry, TrustLedgerGLPostingError } from '@/lib/accounttrack/post-trust-ledger-entry'
import { ExchangeRateError } from '@/lib/accounttrack/exchange-rate'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Allocation =
  | { type: 'invoice'; invoice_id: string; amount: number }
  | { type: 'trust' | 'retainer' | 'refund'; matter_id: string; amount: number }

type AllocationResult = {
  allocation: Allocation
  status: 'success' | 'failed' | 'not_attempted'
  detail?: string
}

function errorMessage(err: unknown): string {
  if (err instanceof InvoiceCreationError) return err.message
  if (err instanceof TrustLedgerGLPostingError) return `Recorded but GL posting failed: ${err.message}`
  if (err instanceof JournalPostingError) return err.message
  if (err instanceof ExchangeRateError) return err.message
  return (err as Error).message || 'Unknown error'
}

// One receipt allocated across multiple invoices plus optional trust/
// retainer/refund lines, reconciled to a single total -- FirmTrack's
// "Receive Payment" screen. Orchestrates the existing, already-atomic
// per-item helpers (applyInvoicePayment, postTrustLedgerEntry) sequentially
// rather than one big multi-table RPC (see the AccountTrack manual-entry
// plan for why). Validates everything up front; on the first failure,
// stops and reports exactly what succeeded/failed/wasn't attempted --
// already-applied allocations are NOT rolled back (trust-ledger entries in
// particular are append-only by design).
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

  const { account_id, from, date, amount, explanation, reference, allocations } = await request.json() as {
    account_id: string
    from?: string
    date?: string
    amount: number
    explanation?: string
    payment_method?: string
    reference?: string
    allocations: Allocation[]
  }

  if (!account_id) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return NextResponse.json({ error: 'At least one allocation is required' }, { status: 400 })
  }

  const effectiveDate = date || new Date().toISOString().split('T')[0]
  const totalAmount = Number(amount)
  if (!(totalAmount > 0)) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const allocatedSum = allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0)
  if (Math.abs(allocatedSum - totalAmount) > 0.005) {
    return NextResponse.json(
      { error: `Allocations (${allocatedSum}) must sum to the receipt amount (${totalAmount})` },
      { status: 400 }
    )
  }

  const { data: account } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id, key, is_cash_account')
    .eq('id', account_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()

  if (!account || !account.is_cash_account) {
    return NextResponse.json({ error: 'account_id must be a cash/bank account for this tenant' }, { status: 400 })
  }
  if (account.key === 'trust_bank') {
    return NextResponse.json(
      { error: 'Trust Bank cannot be selected here -- trust/retainer/refund allocations always post to Trust regardless of the receiving account' },
      { status: 400 }
    )
  }

  const invoiceAllocations = allocations.filter((a): a is Extract<Allocation, { type: 'invoice' }> => a.type === 'invoice')
  const matterAllocations = allocations.filter((a): a is Extract<Allocation, { type: 'trust' | 'retainer' | 'refund' }> => a.type !== 'invoice')

  type InvoiceRow = {
    id: string
    status: string
    matter_id: string
    invoice_number: string
    currency: string | null
    total_amount: number
    paid_amount: number
    base_currency_amount: number | null
  }
  const invoiceIds = invoiceAllocations.map((a) => a.invoice_id)
  const { data: invoices } = invoiceIds.length
    ? await supabaseAdmin.from('invoices').select('*').eq('tenant_id', profile.tenant_id).in('id', invoiceIds)
    : { data: [] as InvoiceRow[] }
  const invoiceById = new Map<string, InvoiceRow>((invoices || []).map((inv) => [inv.id, inv as InvoiceRow]))

  for (const a of invoiceAllocations) {
    const inv = invoiceById.get(a.invoice_id)
    if (!inv) return NextResponse.json({ error: `Invoice ${a.invoice_id} not found for this tenant` }, { status: 400 })
    if (inv.status === 'void') return NextResponse.json({ error: `Invoice ${a.invoice_id} is void` }, { status: 400 })
    const outstanding = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)
    if (Number(a.amount) > outstanding + 0.005) {
      return NextResponse.json({ error: `Allocation of ${a.amount} exceeds invoice ${a.invoice_id}'s outstanding balance (${outstanding})` }, { status: 400 })
    }
  }

  const matterIds = [...new Set(matterAllocations.map((a) => a.matter_id))]
  if (matterIds.length) {
    const { data: matters } = await supabaseAdmin.from('matters').select('id').eq('tenant_id', profile.tenant_id).in('id', matterIds)
    const foundIds = new Set((matters || []).map((m) => m.id))
    for (const id of matterIds) {
      if (!foundIds.has(id)) return NextResponse.json({ error: `Matter ${id} not found for this tenant` }, { status: 400 })
    }
  }

  try {
    await assertPeriodOpen(profile.tenant_id, effectiveDate)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  // Invoice allocations first (grid order), then trust, retainer, refund.
  const orderedAllocations: Allocation[] = [
    ...invoiceAllocations,
    ...matterAllocations.filter((a) => a.type === 'trust'),
    ...matterAllocations.filter((a) => a.type === 'retainer'),
    ...matterAllocations.filter((a) => a.type === 'refund'),
  ]

  const results: AllocationResult[] = orderedAllocations.map((allocation) => ({ allocation, status: 'not_attempted' }))
  let firstError: string | null = null

  for (let i = 0; i < orderedAllocations.length; i++) {
    if (firstError) break
    const allocation = orderedAllocations[i]

    try {
      if (allocation.type === 'invoice') {
        const invoice = invoiceById.get(allocation.invoice_id)!
        await applyInvoicePayment({
          tenantId: profile.tenant_id,
          invoice,
          paymentAmount: Number(allocation.amount),
          entryDate: effectiveDate,
          createdBy: user.id,
          cashAccountId: account_id,
          reference: reference || null,
        })
      } else if (allocation.type === 'trust' || allocation.type === 'retainer') {
        await postTrustLedgerEntry({
          tenantId: profile.tenant_id,
          matterId: allocation.matter_id,
          ledgerType: allocation.type,
          entryDate: effectiveDate,
          amount: Number(allocation.amount),
          description: `Received from ${from || 'payer'}${explanation ? `: ${explanation}` : ''}`,
          reference: reference || null,
          createdBy: user.id,
        })
      } else {
        // refund: parks the refundable amount in Trust Liability now --
        // the actual outgoing refund is a separate later step (a General
        // Check paid from Trust Bank), not modeled here.
        await postTrustLedgerEntry({
          tenantId: profile.tenant_id,
          matterId: allocation.matter_id,
          ledgerType: 'trust',
          entryDate: effectiveDate,
          amount: Number(allocation.amount),
          transactionType: 'refund_intake',
          description: `Received from ${from || 'payer'} for refund`,
          reference: reference || null,
          createdBy: user.id,
        })
      }
      results[i].status = 'success'
    } catch (err) {
      results[i].status = 'failed'
      results[i].detail = errorMessage(err)
      firstError = results[i].detail!
    }
  }

  if (firstError) {
    return NextResponse.json({ error: firstError, results }, { status: 400 })
  }

  return NextResponse.json({ results })
}
