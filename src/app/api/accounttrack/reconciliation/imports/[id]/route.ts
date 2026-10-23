import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { suggestMatches, type JournalLineCandidate } from '@/lib/accounttrack/reconciliation-matching'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns the import, its statement lines, and -- for every still-unmatched
// line -- a ranked list of candidate journal_lines on the same account to
// confirm a match against. Never auto-applies a match; this is read-only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: importRow } = await supabaseAdmin
    .from('bank_statement_imports')
    .select('*, chart_of_accounts(name, code)')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!importRow) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  const { data: lines, error: linesError } = await supabaseAdmin
    .from('bank_statement_lines')
    .select('*')
    .eq('import_id', id)
    .order('line_date')
  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })

  // Already-matched journal_lines (by any statement line, in any import for
  // this account) are excluded from candidacy -- a journal line can only
  // ever be matched once (also enforced by the unique index).
  const { data: alreadyMatched } = await supabaseAdmin
    .from('bank_statement_lines')
    .select('matched_journal_line_id')
    .eq('tenant_id', profile.tenant_id)
    .not('matched_journal_line_id', 'is', null)
  const matchedIds = new Set((alreadyMatched || []).map((r) => r.matched_journal_line_id))

  const { data: journalLines } = await supabaseAdmin
    .from('journal_lines')
    .select('id, debit, credit, description, journal_entries!inner(entry_date)')
    .eq('account_id', importRow.account_id)
    .eq('tenant_id', profile.tenant_id)

  const candidates: JournalLineCandidate[] = (journalLines || [])
    .filter((jl) => !matchedIds.has(jl.id))
    .map((jl) => {
      const entry = Array.isArray(jl.journal_entries) ? jl.journal_entries[0] : jl.journal_entries
      return {
        journalLineId: jl.id,
        entryDate: entry?.entry_date,
        description: jl.description,
        debit: Number(jl.debit),
        credit: Number(jl.credit),
      }
    })

  const linesWithSuggestions = (lines || []).map((line) => ({
    ...line,
    suggestions: line.status === 'unmatched' ? suggestMatches({ lineDate: line.line_date, amount: Number(line.amount) }, candidates) : [],
  }))

  return NextResponse.json({ import: importRow, lines: linesWithSuggestions })
}

// Removing an import only makes sense before anything on it has been
// matched -- once a line is matched it's evidence the reconciliation
// actually happened, so deleting the import shouldn't silently erase that.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: importRow } = await supabaseAdmin
    .from('bank_statement_imports')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!importRow) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  const { count } = await supabaseAdmin
    .from('bank_statement_lines')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', id)
    .eq('status', 'matched')
  if (count && count > 0) {
    return NextResponse.json({ error: 'Cannot delete an import that has matched lines -- unmatch them first' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('bank_statement_imports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
