import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAccounts() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { user, profile }
}

// Confirms a match a human picked (from the GET suggestions, or any other
// journal_lines row on the same account) -- never auto-applied.
export async function POST(request: Request) {
  const { error, user, profile } = await requireAccounts()
  if (error) return error

  const { statement_line_id, journal_line_id } = await request.json()
  if (!statement_line_id || !journal_line_id) {
    return NextResponse.json({ error: 'statement_line_id and journal_line_id are required' }, { status: 400 })
  }

  const { data: statementLine } = await supabaseAdmin
    .from('bank_statement_lines')
    .select('id, import_id, status, bank_statement_imports!inner(account_id, tenant_id)')
    .eq('id', statement_line_id)
    .eq('tenant_id', profile!.tenant_id)
    .single()
  if (!statementLine) return NextResponse.json({ error: 'Statement line not found' }, { status: 404 })
  if (statementLine.status === 'matched') {
    return NextResponse.json({ error: 'This statement line is already matched' }, { status: 400 })
  }

  const imports = Array.isArray(statementLine.bank_statement_imports) ? statementLine.bank_statement_imports[0] : statementLine.bank_statement_imports

  const { data: journalLine } = await supabaseAdmin
    .from('journal_lines')
    .select('id, account_id')
    .eq('id', journal_line_id)
    .eq('tenant_id', profile!.tenant_id)
    .single()
  if (!journalLine) return NextResponse.json({ error: 'Journal line not found' }, { status: 404 })
  if (journalLine.account_id !== imports?.account_id) {
    return NextResponse.json({ error: 'That journal line is not on this statement\'s account' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('bank_statement_lines')
    .update({
      status: 'matched',
      matched_journal_line_id: journal_line_id,
      matched_at: new Date().toISOString(),
      matched_by: user!.id,
    })
    .eq('id', statement_line_id)
    .select()
    .single()

  // The unique index on matched_journal_line_id is the real guard against a
  // race (two people confirming the same journal line at once) -- surface
  // that as a normal 400, not a 500.
  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json({ error: 'That journal line was just matched to another statement line' }, { status: 400 })
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ line: updated })
}

// Reverses a match (back to unmatched) or marks a line ignored (e.g. a bank
// fee or interest line nothing in the ledger will ever match) -- both via
// PATCH since they're the same "change this line's status" shape.
export async function PATCH(request: Request) {
  const { error, profile } = await requireAccounts()
  if (error) return error

  const { statement_line_id, status } = await request.json()
  if (!statement_line_id || !['unmatched', 'ignored'].includes(status)) {
    return NextResponse.json({ error: 'statement_line_id and status (unmatched|ignored) are required' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('bank_statement_lines')
    .update({
      status,
      matched_journal_line_id: null,
      matched_at: null,
      matched_by: null,
    })
    .eq('id', statement_line_id)
    .eq('tenant_id', profile!.tenant_id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ line: updated })
}
