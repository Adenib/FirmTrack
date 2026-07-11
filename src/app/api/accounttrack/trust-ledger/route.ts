import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { assertPeriodOpen, postJournalEntry, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'
import type { AccountKey } from '@/lib/accounttrack/default-accounts'

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
  const ledgerType = searchParams.get('ledger_type')

  let query = supabaseAdmin
    .from('trust_ledger_entries')
    .select('*, matters(matter_id, case_name)')
    .eq('tenant_id', profile.tenant_id)
    .order('entry_date', { ascending: false })

  if (matterId) query = query.eq('matter_id', matterId)
  if (ledgerType) query = query.eq('ledger_type', ledgerType)

  const { data: entries, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries })
}

// Append-only: no PATCH/DELETE. Corrections are offsetting entries, so the
// ledger always reconstructs to a true balance (real trust-accounting
// audit-trail requirement, not just a UX preference).
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

  const { matter_id, ledger_type, entry_date, amount_usd, transaction_type, description, reference } =
    await request.json()

  if (!matter_id || !['trust', 'retainer'].includes(ledger_type) || !amount_usd) {
    return NextResponse.json(
      { error: "matter_id, ledger_type ('trust'|'retainer'), and a non-zero amount_usd are required" },
      { status: 400 }
    )
  }

  const effectiveDate = entry_date || new Date().toISOString().split('T')[0]

  try {
    await assertPeriodOpen(profile.tenant_id, effectiveDate)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  const { data: entry, error } = await supabaseAdmin
    .from('trust_ledger_entries')
    .insert({
      tenant_id: profile.tenant_id,
      matter_id,
      ledger_type,
      entry_date: effectiveDate,
      amount_usd: Number(amount_usd),
      transaction_type: transaction_type || null,
      description: description || null,
      reference: reference || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const amount = Number(amount_usd)
  const deposit = amount > 0
  const liabilityKey: AccountKey = ledger_type === 'trust' ? 'trust_liability' : 'retainer_liability'
  const sourceType = deposit
    ? (ledger_type === 'trust' ? 'trust_deposit' : 'retainer_deposit')
    : (ledger_type === 'trust' ? 'trust_withdrawal' : 'retainer_withdrawal')

  try {
    await postJournalEntry({
      tenantId: profile.tenant_id,
      entryDate: effectiveDate,
      description: description || `${ledger_type} ${deposit ? 'deposit' : 'withdrawal'}`,
      sourceType,
      sourceId: entry.id,
      createdBy: user.id,
      lines: deposit
        ? [
            { accountKey: 'trust_bank', matterId: matter_id, debitUsd: Math.abs(amount) },
            { accountKey: liabilityKey, matterId: matter_id, creditUsd: Math.abs(amount) },
          ]
        : [
            { accountKey: liabilityKey, matterId: matter_id, debitUsd: Math.abs(amount) },
            { accountKey: 'trust_bank', matterId: matter_id, creditUsd: Math.abs(amount) },
          ],
    })
  } catch (err) {
    return NextResponse.json({ error: `Ledger entry recorded but GL posting failed: ${(err as Error).message}` }, { status: 500 })
  }

  return NextResponse.json({ entry })
}
