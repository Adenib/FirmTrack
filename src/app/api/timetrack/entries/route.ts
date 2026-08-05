import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getExchangeRate, ExchangeRateError } from '@/lib/accounttrack/exchange-rate'

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
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const lawyerId = searchParams.get('lawyer_id')
  const matterId = searchParams.get('matter_id')
  const status = searchParams.get('status')
  const entryType = searchParams.get('entry_type')

  let query = supabaseAdmin
    .from('time_entries')
    .select(`
      *,
      lawyers(nickname, initials),
      matters(matter_id, case_name),
      task_codes(code, description),
      ft_calendar_events(title, start_at)
    `)
    .eq('tenant_id', profile.tenant_id)
    .order('entry_date', { ascending: false })

  if (from) query = query.gte('entry_date', from)
  if (to) query = query.lte('entry_date', to)
  if (lawyerId) query = query.eq('lawyer_id', lawyerId)
  if (matterId) query = query.eq('matter_id', matterId)
  if (status) query = query.eq('status', status)
  if (entryType) query = query.eq('entry_type', entryType)

  const { data: entries, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json()
  const rows = Array.isArray(body) ? body : body.entries

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'entries array is required' }, { status: 400 })
  }

  const candidateRows = rows.filter((r) => r.matter_id && (Number(r.hours) > 0 || Number(r.amount) > 0))
  const matterIds = [...new Set(candidateRows.map((r) => r.matter_id))]

  const [{ data: matters }, { data: org }] = await Promise.all([
    matterIds.length > 0
      ? supabaseAdmin.from('matters').select('id, billing_currency').eq('tenant_id', profile.tenant_id).in('id', matterIds)
      : Promise.resolve({ data: [] as { id: string; billing_currency: string | null }[] }),
    supabaseAdmin.from('organizations').select('base_currency').eq('id', profile.tenant_id).single(),
  ])
  const currencyByMatter = new Map((matters || []).map((m) => [m.id, m.billing_currency]))
  const baseCurrency = org?.base_currency || 'NGN'

  // Rate depends on (currency, entry_date), which can vary per row within
  // one batch (different matters/dates in a single timesheet submission).
  // Cache lookups per (currency, date) pair to avoid redundant DB calls
  // when a batch shares the same matter/date across many lines.
  const rateCache = new Map<string, number>()
  let entryRows
  try {
    entryRows = await Promise.all(
      candidateRows.map(async (r) => {
        const entryDate = r.entry_date || new Date().toISOString().split('T')[0]
        const currency = currencyByMatter.get(r.matter_id) || baseCurrency
        const cacheKey = `${currency}->${entryDate}`
        let rate = rateCache.get(cacheKey)
        if (rate === undefined) {
          rate = await getExchangeRate(profile.tenant_id, currency, baseCurrency, entryDate)
          rateCache.set(cacheKey, rate)
        }
        return {
          tenant_id: profile.tenant_id,
          lawyer_id: r.lawyer_id || null,
          matter_id: r.matter_id,
          task_code_id: r.task_code_id || null,
          entry_date: entryDate,
          hours: r.hours || null,
          rate: r.rate || null,
          amount: r.amount || null,
          currency,
          base_currency_amount: r.amount ? Number(r.amount) * rate : null,
          expl_code: r.expl_code || null,
          explanation: r.explanation || null,
          notes: r.notes || null,
          hold: !!r.hold,
          billable: r.billable === false ? false : true,
          calendar_event_id: r.calendar_event_id || null,
          entry_type: r.entry_type === 'quickfee' ? 'quickfee' : 'timesheet',
          status: 'submitted',
          created_by: user.id,
        }
      })
    )
  } catch (err) {
    if (err instanceof ExchangeRateError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }

  if (entryRows.length === 0) {
    return NextResponse.json({ error: 'No valid entries to save (matter and hours/amount required)' }, { status: 400 })
  }

  const { data: entries, error } = await supabaseAdmin
    .from('time_entries')
    .insert(entryRows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { id, status, hold, billable } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status !== undefined) updates.status = status
  if (hold !== undefined) updates.hold = hold
  if (billable !== undefined) updates.billable = billable

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}
