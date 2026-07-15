import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Bucket = {
  label: string
  start: string
  end: string
  sentCount: number
  sentUsd: number
  pendingUsd: number
  paidUsd: number
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Auto-chooses bucket granularity from the selected range: short ranges
// get weekly buckets (fine enough detail to be useful), longer ranges get
// monthly buckets (so a year-long range doesn't render 52 bars).
function buildBuckets(from: string, to: string): Bucket[] {
  const start = new Date(from)
  const end = new Date(to)
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  const monthly = days > 45

  const buckets: Bucket[] = []
  if (monthly) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cursor <= end) {
      const bucketStart = new Date(cursor)
      const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      buckets.push({
        label: bucketStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        start: iso(bucketStart < start ? start : bucketStart),
        end: iso(bucketEnd > end ? end : bucketEnd),
        sentCount: 0,
        sentUsd: 0,
        pendingUsd: 0,
        paidUsd: 0,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    const cursor = new Date(start)
    while (cursor <= end) {
      const bucketStart = new Date(cursor)
      const bucketEnd = new Date(cursor)
      bucketEnd.setDate(bucketEnd.getDate() + 6)
      buckets.push({
        label: `${iso(bucketStart).slice(5)} – ${iso(bucketEnd > end ? end : bucketEnd).slice(5)}`,
        start: iso(bucketStart),
        end: iso(bucketEnd > end ? end : bucketEnd),
        sentCount: 0,
        sentUsd: 0,
        pendingUsd: 0,
        paidUsd: 0,
      })
      cursor.setDate(cursor.getDate() + 7)
    }
  }
  return buckets
}

function findBucket(buckets: Bucket[], date: string): Bucket | undefined {
  return buckets.find((b) => date >= b.start && date <= b.end)
}

// Firmwide BillTrack report: per period, "sent" (invoices issued), "pending"
// (unbilled WIP time/disbursements — not yet invoiced, distinct from unpaid
// invoices), and "paid" (payments actually recorded, bucketed by the date
// the payment journal entry was posted, not the invoice date, since an
// invoice can be paid in a different period than it was sent).
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'billtrack'))) {
    return NextResponse.json({ error: 'BillTrack is not active for this tenant' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })

  const buckets = buildBuckets(from, to)

  const [invoicesRes, timeEntriesRes, disbursementsRes, paymentEntriesRes] = await Promise.all([
    supabaseAdmin
      .from('invoices')
      .select('invoice_date, total_amount_usd, status')
      .eq('tenant_id', profile.tenant_id)
      .gte('invoice_date', from)
      .lte('invoice_date', to)
      .neq('status', 'void'),
    supabaseAdmin
      .from('time_entries')
      .select('entry_date, amount_usd')
      .eq('tenant_id', profile.tenant_id)
      .eq('billable', true)
      .in('status', ['draft', 'submitted'])
      .gte('entry_date', from)
      .lte('entry_date', to),
    supabaseAdmin
      .from('disbursements')
      .select('disb_date, amount_usd')
      .eq('tenant_id', profile.tenant_id)
      .eq('billed', false)
      .gte('disb_date', from)
      .lte('disb_date', to),
    supabaseAdmin
      .from('journal_entries')
      .select('entry_date, journal_lines(debit_usd, chart_of_accounts(key))')
      .eq('tenant_id', profile.tenant_id)
      .eq('source_type', 'invoice_payment')
      .gte('entry_date', from)
      .lte('entry_date', to),
  ])

  for (const inv of invoicesRes.data || []) {
    const bucket = findBucket(buckets, inv.invoice_date)
    if (!bucket) continue
    bucket.sentCount += 1
    bucket.sentUsd += Number(inv.total_amount_usd || 0)
  }

  for (const e of timeEntriesRes.data || []) {
    const bucket = findBucket(buckets, e.entry_date)
    if (bucket) bucket.pendingUsd += Number(e.amount_usd || 0)
  }
  for (const d of disbursementsRes.data || []) {
    const bucket = findBucket(buckets, d.disb_date)
    if (bucket) bucket.pendingUsd += Number(d.amount_usd || 0)
  }

  for (const entry of paymentEntriesRes.data || []) {
    const bucket = findBucket(buckets, entry.entry_date)
    if (!bucket) continue
    const lines = Array.isArray(entry.journal_lines) ? entry.journal_lines : []
    const cashLine = lines.find((l) => {
      const acct = Array.isArray(l.chart_of_accounts) ? l.chart_of_accounts[0] : l.chart_of_accounts
      return acct?.key === 'operating_cash'
    })
    if (cashLine) bucket.paidUsd += Number(cashLine.debit_usd || 0)
  }

  const summary = buckets.reduce(
    (acc, b) => ({
      sentCount: acc.sentCount + b.sentCount,
      sentUsd: acc.sentUsd + b.sentUsd,
      pendingUsd: acc.pendingUsd + b.pendingUsd,
      paidUsd: acc.paidUsd + b.paidUsd,
    }),
    { sentCount: 0, sentUsd: 0, pendingUsd: 0, paidUsd: 0 }
  )

  return NextResponse.json({ buckets, summary })
}
