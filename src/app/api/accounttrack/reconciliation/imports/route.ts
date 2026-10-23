import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

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
  const accountId = searchParams.get('account_id')

  let query = supabaseAdmin
    .from('bank_statement_imports')
    .select('*, chart_of_accounts(name, code)')
    .eq('tenant_id', profile.tenant_id)
    .order('statement_end', { ascending: false })

  if (accountId) query = query.eq('account_id', accountId)

  const { data: imports, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imports })
}

type IncomingLine = { line_date: string; description?: string; amount: number; reference?: string }

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

  const { account_id, statement_start, statement_end, opening_balance, closing_balance, lines } = await request.json()

  if (!account_id || !statement_start || !statement_end || opening_balance === undefined || closing_balance === undefined) {
    return NextResponse.json({ error: 'account_id, statement_start, statement_end, opening_balance, and closing_balance are required' }, { status: 400 })
  }

  const { data: account } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id, is_cash_account')
    .eq('id', account_id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  if (!account.is_cash_account) {
    return NextResponse.json({ error: 'Only accounts flagged as cash/bank accounts can be reconciled' }, { status: 400 })
  }

  const { data: importRow, error: importError } = await supabaseAdmin
    .from('bank_statement_imports')
    .insert({
      tenant_id: profile.tenant_id,
      account_id,
      statement_start,
      statement_end,
      opening_balance,
      closing_balance,
      imported_by: user.id,
    })
    .select()
    .single()

  if (importError) return NextResponse.json({ error: importError.message }, { status: 500 })

  const incomingLines: IncomingLine[] = Array.isArray(lines) ? lines : []
  const rows = incomingLines
    .filter((l) => l.line_date && typeof l.amount === 'number' && !Number.isNaN(l.amount))
    .map((l) => ({
      tenant_id: profile.tenant_id,
      import_id: importRow.id,
      line_date: l.line_date,
      description: l.description || null,
      amount: l.amount,
      reference: l.reference || null,
    }))

  if (rows.length > 0) {
    const { error: linesError } = await supabaseAdmin.from('bank_statement_lines').insert(rows)
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  return NextResponse.json({ import: importRow, linesInserted: rows.length })
}
