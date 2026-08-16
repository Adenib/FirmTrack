import { createClient } from '@supabase/supabase-js'
import { DEFAULT_ACCOUNTS, type AccountKey } from './default-accounts'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Either accountKey (one of the 8 seeded default accounts, resolved by
// lookup) or accountId (a raw id — required for posting to arbitrary
// custom accounts, e.g. year-end closing entries which zero whatever
// revenue/expense accounts a tenant happens to have).
export type JournalLineInput = {
  accountKey?: AccountKey
  accountId?: string
  matterId?: string | null
  lawyerId?: string | null
  debit?: number
  credit?: number
  description?: string | null
  // Set only when this line posts against a genuinely foreign-currency
  // account (chart_of_accounts.currency is set) -- tags the line with its
  // native-currency amount so period-end revaluation has something to
  // revalue. Left unset for the overwhelming majority of lines (base-currency
  // accounts), matching today's behavior exactly.
  originalCurrency?: string | null
  originalAmount?: number | null
}

export type PostJournalEntryInput = {
  tenantId: string
  entryDate: string
  description?: string | null
  sourceType: string
  sourceId?: string | null
  createdBy: string
  lines: JournalLineInput[]
  // Free-text reference (e.g. "JV-2026-0041", a check number) -- set
  // after the RPC posts the entry, since post_journal_entry itself has no
  // reference parameter.
  reference?: string | null
}

// Thrown for both "period is closed" (checked here, before any row is
// written) and "not balanced" (checked here as a fast client-side guard,
// then re-checked inside post_journal_entry itself as defense in depth).
export class JournalPostingError extends Error {}

// Called at the top of every route that writes a money-movement row
// (before the row itself is inserted), so a closed-period rejection
// happens before an orphaned disbursement/invoice/trust-entry row can be
// written. post_journal_entry() enforces this too, but only after the
// triggering row already exists — this is the early, row-preventing check.
export async function assertPeriodOpen(tenantId: string, entryDate: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('accounting_periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'closed')
    .lte('period_start', entryDate)
    .gte('period_end', entryDate)
    .limit(1)

  if (data && data.length > 0) {
    throw new JournalPostingError(`Accounting period is closed for ${entryDate}`)
  }
}

async function resolveAccountIds(tenantId: string, keys: AccountKey[]): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id, key')
    .eq('tenant_id', tenantId)
    .in('key', keys)

  if (error) throw new JournalPostingError(error.message)

  const map: Record<string, string> = {}
  for (const row of data || []) {
    if (row.key) map[row.key] = row.id
  }
  for (const key of keys) {
    if (!map[key]) {
      throw new JournalPostingError(
        `Default account "${key}" not found for tenant — expected one of the seeded accounts (${DEFAULT_ACCOUNTS.map((a) => a.key).join(', ')})`
      )
    }
  }
  return map
}

// Resolves account keys (for lines that use one), drops zero-amount lines,
// asserts the entry balances client-side (post_journal_entry re-checks
// server-side as defense in depth), then posts atomically via the RPC.
export async function postJournalEntry(input: PostJournalEntryInput): Promise<string> {
  const nonZeroLines = input.lines.filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0)
  if (nonZeroLines.length === 0) {
    throw new JournalPostingError('No non-zero lines to post')
  }

  const keysToResolve = nonZeroLines
    .filter((l) => !l.accountId)
    .map((l) => {
      if (!l.accountKey) throw new JournalPostingError('Each line needs either accountKey or accountId')
      return l.accountKey
    })
  const accountIds = keysToResolve.length > 0 ? await resolveAccountIds(input.tenantId, keysToResolve) : {}

  const totalDebit = nonZeroLines.reduce((sum, l) => sum + (l.debit || 0), 0)
  const totalCredit = nonZeroLines.reduce((sum, l) => sum + (l.credit || 0), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new JournalPostingError(`Journal entry not balanced: debit=${totalDebit} credit=${totalCredit}`)
  }

  const { data, error } = await supabaseAdmin.rpc('post_journal_entry', {
    p_tenant_id: input.tenantId,
    p_entry_date: input.entryDate,
    p_description: input.description || null,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId || null,
    p_created_by: input.createdBy,
    p_lines: nonZeroLines.map((l) => ({
      account_id: l.accountId || accountIds[l.accountKey as AccountKey],
      matter_id: l.matterId || null,
      lawyer_id: l.lawyerId || null,
      debit: l.debit || 0,
      credit: l.credit || 0,
      description: l.description || null,
      original_currency: l.originalCurrency || null,
      original_amount: l.originalAmount ?? null,
    })),
  })

  if (error) throw new JournalPostingError(error.message)
  const entryId = data as string

  if (input.reference) {
    await supabaseAdmin.from('journal_entries').update({ reference: input.reference }).eq('id', entryId)
  }

  return entryId
}
