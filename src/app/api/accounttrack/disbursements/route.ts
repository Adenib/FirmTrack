import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { assertPeriodOpen, postJournalEntry, JournalPostingError } from '@/lib/accounttrack/post-journal-entry'
import { getExchangeRate, ExchangeRateError } from '@/lib/accounttrack/exchange-rate'
import { tagOriginalAmount } from '@/lib/accounttrack/tag-original-amount'

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

  let query = supabaseAdmin
    .from('disbursements')
    .select('*, matters(matter_id, case_name), lawyers(nickname)')
    .eq('tenant_id', profile.tenant_id)
    .order('disb_date', { ascending: false })

  if (matterId) query = query.eq('matter_id', matterId)

  const { data: disbursements, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ disbursements })
}

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

  const { matter_id, lawyer_id, disb_date, description, amount } = await request.json()

  if (!matter_id || !(Number(amount) > 0)) {
    return NextResponse.json({ error: 'matter_id and a positive amount are required' }, { status: 400 })
  }

  const effectiveDate = disb_date || new Date().toISOString().split('T')[0]

  try {
    await assertPeriodOpen(profile.tenant_id, effectiveDate)
  } catch (err) {
    if (err instanceof JournalPostingError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  const [{ data: matter }, { data: org }] = await Promise.all([
    supabaseAdmin.from('matters').select('billing_currency').eq('id', matter_id).eq('tenant_id', profile.tenant_id).single(),
    supabaseAdmin.from('organizations').select('base_currency').eq('id', profile.tenant_id).single(),
  ])
  const disbCurrency = matter?.billing_currency || org?.base_currency || 'NGN'
  const baseCurrency = org?.base_currency || 'NGN'

  let rate: number
  try {
    rate = await getExchangeRate(profile.tenant_id, disbCurrency, baseCurrency, effectiveDate)
  } catch (err) {
    if (err instanceof ExchangeRateError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
  const baseAmount = Number(amount) * rate

  const { data: disbursement, error } = await supabaseAdmin
    .from('disbursements')
    .insert({
      tenant_id: profile.tenant_id,
      matter_id,
      lawyer_id: lawyer_id || null,
      disb_date: effectiveDate,
      description: description || null,
      amount: Number(amount),
      currency: disbCurrency,
      base_currency_amount: baseAmount,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cashTag = await tagOriginalAmount(profile.tenant_id, 'operating_cash', disbCurrency, Number(amount))

  try {
    await postJournalEntry({
      tenantId: profile.tenant_id,
      entryDate: effectiveDate,
      description: description || 'Disbursement recorded',
      sourceType: 'disbursement_recorded',
      sourceId: disbursement.id,
      createdBy: user.id,
      lines: [
        { accountKey: 'client_costs_advanced', matterId: matter_id, lawyerId: lawyer_id || null, debit: baseAmount },
        { accountKey: 'operating_cash', matterId: matter_id, lawyerId: lawyer_id || null, credit: baseAmount, ...cashTag },
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: `Disbursement recorded but GL posting failed: ${(err as Error).message}` }, { status: 500 })
  }

  return NextResponse.json({ disbursement })
}
