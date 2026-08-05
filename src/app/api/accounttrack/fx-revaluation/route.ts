import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { assertPeriodOpen, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'
import { revalueForeignCurrencyAccounts } from '@/lib/accounttrack/revalue-fx-accounts'
import { ExchangeRateError } from '@/lib/accounttrack/exchange-rate'

// Manually revalues every foreign-currency account (e.g. a real USD bank
// account) to a chosen date's rate, booking unrealized FX gain/loss for the
// difference from its current book value. See revalue-fx-accounts.ts for
// the accounting logic; this also runs automatically on period close
// (src/app/api/accounttrack/accounting-periods/route.ts).
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized — revaluing accounts requires owner or admin' }, { status: 403 })
  }

  if (!(await hasActiveModule(profile.tenant_id, 'accounttrack'))) {
    return NextResponse.json({ error: 'AccountTrack is not active for this tenant' }, { status: 403 })
  }

  const { as_of_date } = await request.json()
  const asOfDate = as_of_date || new Date().toISOString().split('T')[0]

  try {
    await assertPeriodOpen(profile.tenant_id, asOfDate)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  try {
    const result = await revalueForeignCurrencyAccounts(profile.tenant_id, asOfDate, user.id, 'fx_revaluation_manual')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ExchangeRateError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
