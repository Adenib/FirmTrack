import { createClient } from '@supabase/supabase-js'
import { getExchangeRate } from './exchange-rate'
import { postJournalEntry, type JournalLineInput } from './post-journal-entry'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type FxRevaluationResult = {
  entryId: string | null
  adjustments: { accountName: string; accountCurrency: string; delta: number }[]
}

// Revalues every foreign-currency asset/liability account
// (chart_of_accounts.currency set, e.g. a real USD bank account) to asOfDate's
// rate, booking the difference between its current base-currency book value
// and what its tracked foreign-currency balance is actually worth today as
// unrealized FX gain/loss. Works entirely in raw signed (debit - credit)
// terms for both the account's book value and its foreign-currency balance,
// so the same delta-sign rule (positive = gain, negative = loss) holds
// uniformly for asset and liability accounts without special-casing normal
// balance direction.
//
// Only accounts with at least one journal_lines row carrying a tagged
// original_amount (see tag-original-amount.ts) have anything to revalue --
// tenants with no foreign-currency accounts (the overwhelming majority,
// including every NGN-only tenant) get {entryId: null, adjustments: []},
// a no-op.
export async function revalueForeignCurrencyAccounts(
  tenantId: string,
  asOfDate: string,
  createdBy: string,
  sourceType: 'fx_revaluation_manual' | 'fx_revaluation_period_close',
  sourceId?: string | null
): Promise<FxRevaluationResult> {
  const [{ data: org }, { data: accounts }] = await Promise.all([
    supabaseAdmin.from('organizations').select('base_currency').eq('id', tenantId).single(),
    supabaseAdmin
      .from('chart_of_accounts')
      .select('id, name, currency')
      .eq('tenant_id', tenantId)
      .not('currency', 'is', null)
      .in('account_type', ['asset', 'liability']),
  ])
  const baseCurrency = org?.base_currency || 'NGN'
  const foreignAccounts = (accounts || []).filter((a) => a.currency && a.currency !== baseCurrency)

  if (foreignAccounts.length === 0) return { entryId: null, adjustments: [] }

  const accountIds = foreignAccounts.map((a) => a.id)
  const { data: lines } = await supabaseAdmin
    .from('journal_lines')
    .select('account_id, debit, credit, original_amount, journal_entries!inner(entry_date, tenant_id)')
    .eq('tenant_id', tenantId)
    .in('account_id', accountIds)
    .lte('journal_entries.entry_date', asOfDate)

  const rawCarrying = new Map<string, number>()
  const rawForeign = new Map<string, number>()
  for (const line of lines || []) {
    rawCarrying.set(
      line.account_id,
      (rawCarrying.get(line.account_id) || 0) + Number(line.debit || 0) - Number(line.credit || 0)
    )
    if (line.original_amount !== null && line.original_amount !== undefined) {
      const signedOriginal = Number(line.debit || 0) > 0 ? Number(line.original_amount) : -Number(line.original_amount)
      rawForeign.set(line.account_id, (rawForeign.get(line.account_id) || 0) + signedOriginal)
    }
  }

  const journalLines: JournalLineInput[] = []
  const adjustments: FxRevaluationResult['adjustments'] = []
  let netGain = 0
  let netLoss = 0

  for (const account of foreignAccounts) {
    const foreignBalance = rawForeign.get(account.id) || 0
    if (foreignBalance === 0) continue

    const currentCarrying = rawCarrying.get(account.id) || 0
    const rate = await getExchangeRate(tenantId, account.currency!, baseCurrency, asOfDate)
    const delta = foreignBalance * rate - currentCarrying
    if (Math.abs(delta) <= 0.005) continue

    if (delta > 0) {
      journalLines.push({ accountId: account.id, debit: delta, description: 'FX revaluation' })
      netGain += delta
    } else {
      journalLines.push({ accountId: account.id, credit: -delta, description: 'FX revaluation' })
      netLoss += -delta
    }
    adjustments.push({ accountName: account.name, accountCurrency: account.currency!, delta })
  }

  if (journalLines.length === 0) return { entryId: null, adjustments: [] }

  if (netGain > 0.005) {
    journalLines.push({ accountKey: 'unrealized_fx_gain', credit: netGain, description: 'FX revaluation' })
  }
  if (netLoss > 0.005) {
    journalLines.push({ accountKey: 'unrealized_fx_loss', debit: netLoss, description: 'FX revaluation' })
  }

  const entryId = await postJournalEntry({
    tenantId,
    entryDate: asOfDate,
    description: `Foreign-currency account revaluation as of ${asOfDate}`,
    sourceType,
    sourceId: sourceId || null,
    createdBy,
    lines: journalLines,
  })

  return { entryId, adjustments }
}
