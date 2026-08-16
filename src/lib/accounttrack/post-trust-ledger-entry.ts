import { createClient } from '@supabase/supabase-js'
import { assertPeriodOpen, postJournalEntry, JournalPostingError } from './post-journal-entry'
import { getExchangeRate, ExchangeRateError } from './exchange-rate'
import { tagOriginalAmount } from './tag-original-amount'
import type { AccountKey } from './default-accounts'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export { JournalPostingError, ExchangeRateError }

// Thrown specifically when the trust_ledger_entries row was already
// inserted but the follow-up GL posting failed -- distinct from a plain
// insert failure, so callers can preserve the original route's "recorded
// but GL posting failed" distinction instead of one generic error.
export class TrustLedgerGLPostingError extends Error {
  entry: unknown
  constructor(message: string, entry: unknown) {
    super(message)
    this.entry = entry
  }
}

export type PostTrustLedgerEntryInput = {
  tenantId: string
  matterId: string
  ledgerType: 'trust' | 'retainer'
  entryDate: string
  amount: number
  transactionType?: string | null
  description?: string | null
  reference?: string | null
  createdBy: string
}

// Extracted verbatim from the trust-ledger route's POST handler so it can
// be reused by Receive Payment and General Check's trust-withdrawal path.
// Always posts against trust_bank -- trust funds must sit in the real
// trust account regardless of which account physically received/paid the
// money. Append-only by design: no update/delete, corrections are
// offsetting entries (matches trust_ledger_entries' own contract).
export async function postTrustLedgerEntry(input: PostTrustLedgerEntryInput) {
  await assertPeriodOpen(input.tenantId, input.entryDate)

  const [{ data: matter }, { data: org }] = await Promise.all([
    supabaseAdmin.from('matters').select('billing_currency').eq('id', input.matterId).eq('tenant_id', input.tenantId).single(),
    supabaseAdmin.from('organizations').select('base_currency').eq('id', input.tenantId).single(),
  ])
  const ledgerCurrency = matter?.billing_currency || org?.base_currency || 'NGN'
  const baseCurrency = org?.base_currency || 'NGN'

  const rate = await getExchangeRate(input.tenantId, ledgerCurrency, baseCurrency, input.entryDate)
  const numericAmount = Number(input.amount)
  const baseAmount = numericAmount * rate

  const { data: entry, error } = await supabaseAdmin
    .from('trust_ledger_entries')
    .insert({
      tenant_id: input.tenantId,
      matter_id: input.matterId,
      ledger_type: input.ledgerType,
      entry_date: input.entryDate,
      amount: numericAmount,
      currency: ledgerCurrency,
      base_currency_amount: baseAmount,
      transaction_type: input.transactionType || null,
      description: input.description || null,
      reference: input.reference || null,
      created_by: input.createdBy,
    })
    .select()
    .single()

  // A plain Error here (not JournalPostingError) -- an insert failure is a
  // generic 500, not the period-closed/imbalance 400 case that
  // JournalPostingError signals to callers.
  if (error) throw new Error(error.message)

  const deposit = numericAmount > 0
  const liabilityKey: AccountKey = input.ledgerType === 'trust' ? 'trust_liability' : 'retainer_liability'
  const sourceType = deposit
    ? (input.ledgerType === 'trust' ? 'trust_deposit' : 'retainer_deposit')
    : (input.ledgerType === 'trust' ? 'trust_withdrawal' : 'retainer_withdrawal')

  const bankTag = await tagOriginalAmount(input.tenantId, 'trust_bank', ledgerCurrency, Math.abs(numericAmount))

  try {
    await postJournalEntry({
      tenantId: input.tenantId,
      entryDate: input.entryDate,
      description: input.description || `${input.ledgerType} ${deposit ? 'deposit' : 'withdrawal'}`,
      sourceType,
      sourceId: entry.id,
      createdBy: input.createdBy,
      reference: input.reference,
      lines: deposit
        ? [
            { accountKey: 'trust_bank', matterId: input.matterId, debit: Math.abs(baseAmount), ...bankTag },
            { accountKey: liabilityKey, matterId: input.matterId, credit: Math.abs(baseAmount) },
          ]
        : [
            { accountKey: liabilityKey, matterId: input.matterId, debit: Math.abs(baseAmount) },
            { accountKey: 'trust_bank', matterId: input.matterId, credit: Math.abs(baseAmount), ...bankTag },
          ],
    })
  } catch (err) {
    throw new TrustLedgerGLPostingError((err as Error).message, entry)
  }

  return entry
}
