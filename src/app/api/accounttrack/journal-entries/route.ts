import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { assertPeriodOpen, postJournalEntry, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Two modes over the same underlying data (General Journal = book of
// original entry, chronological; Ledger = the same lines organized by
// account with a running balance) — see the AccountTrack Phase 2 plan for
// why these are one route with different query params, not two.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const tenantId = profile.tenant_id
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const sourceType = searchParams.get('source_type')

  if (accountId) {
    // Ledger mode: lines for one account, running balance.
    const { data: account } = await supabaseAdmin
      .from('chart_of_accounts')
      .select('id, account_type')
      .eq('id', accountId)
      .eq('tenant_id', tenantId)
      .single()

    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    let query = supabaseAdmin
      .from('journal_lines')
      .select('id, debit_usd, credit_usd, description, matter_id, journal_entries!inner(entry_date, description, source_type, tenant_id)')
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })

    if (from) query = query.gte('journal_entries.entry_date', from)
    if (to) query = query.lte('journal_entries.entry_date', to)

    const { data: lines, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const debitNormal = ['asset', 'expense'].includes(account.account_type)
    let running = 0
    const withBalance = (lines || []).map((line) => {
      const delta = debitNormal
        ? Number(line.debit_usd || 0) - Number(line.credit_usd || 0)
        : Number(line.credit_usd || 0) - Number(line.debit_usd || 0)
      running += delta
      return { ...line, running_balance: running }
    })

    return NextResponse.json({ mode: 'ledger', account, lines: withBalance.reverse() })
  }

  // General Journal mode: chronological entries with nested lines.
  let entriesQuery = supabaseAdmin
    .from('journal_entries')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (from) entriesQuery = entriesQuery.gte('entry_date', from)
  if (to) entriesQuery = entriesQuery.lte('entry_date', to)
  if (sourceType) entriesQuery = entriesQuery.eq('source_type', sourceType)

  const { data: entries, error: entriesError } = await entriesQuery
  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 })

  const entryIds = (entries || []).map((e) => e.id)
  let lines: { journal_entry_id: string; [key: string]: unknown }[] = []
  if (entryIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('journal_lines')
      .select('*, chart_of_accounts(code, name)')
      .in('journal_entry_id', entryIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    lines = data || []
  }

  const linesByEntry = new Map<string, typeof lines>()
  for (const line of lines) {
    const list = linesByEntry.get(line.journal_entry_id)
    if (list) list.push(line)
    else linesByEntry.set(line.journal_entry_id, [line])
  }

  const withLines = (entries || []).map((entry) => ({
    ...entry,
    lines: linesByEntry.get(entry.id) || [],
  }))

  return NextResponse.json({ mode: 'journal', entries: withLines })
}

// Manual balanced entry — the only journal-entries write route (auto
// postings happen inline in the invoices/disbursements/trust-ledger
// routes). No PATCH/DELETE: immutable, corrections are reversing entries,
// matching trust_ledger_entries' append-only precedent.
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

  const { entry_date, description, lines } = await request.json()
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'lines array is required' }, { status: 400 })
  }

  const effectiveDate = entry_date || new Date().toISOString().split('T')[0]

  try {
    await assertPeriodOpen(profile.tenant_id, effectiveDate)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  // Manual entries reference accounts by raw id (not a default key), since
  // the whole point is posting to arbitrary/custom accounts. Verify
  // tenant ownership up front — post_journal_entry re-checks this too,
  // but rejecting early avoids a confusing RPC-level error message.
  const requestedIds: string[] = lines.map((l: { account_id: string }) => l.account_id)
  const { data: accounts } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .in('id', requestedIds)

  if (!accounts || accounts.length !== new Set(requestedIds).size) {
    return NextResponse.json({ error: 'One or more accounts do not belong to this tenant' }, { status: 400 })
  }

  try {
    const entryId = await postJournalEntry({
      tenantId: profile.tenant_id,
      entryDate: effectiveDate,
      description: description || 'Manual journal entry',
      sourceType: 'manual',
      createdBy: user.id,
      lines: lines.map((l: { account_id: string; matter_id?: string; lawyer_id?: string; debit_usd?: number; credit_usd?: number; description?: string }) => ({
        accountId: l.account_id,
        matterId: l.matter_id || null,
        lawyerId: l.lawyer_id || null,
        debitUsd: l.debit_usd || 0,
        creditUsd: l.credit_usd || 0,
        description: l.description || null,
      })),
    })
    return NextResponse.json({ journal_entry_id: entryId })
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
