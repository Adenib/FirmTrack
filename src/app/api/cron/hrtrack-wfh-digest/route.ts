import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendWfhDigestEmail, EmailSendError, type WfhDigestEntry } from '@/lib/hrtrack/send-wfh-digest-email'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 60

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

// One daily pass per tenant with an active hrtrack subscription: collate
// today's still-'pending' wfh_activity_checks (a popup shown, never
// answered) by employee, and email the list to owner/admin/hr. Same
// "today" boundary (UTC midnight) as the live panel on the attendance page
// (GET /api/hrtrack/wfh-checks), so both agree on what "today" means.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'
  const dateLabel = todayStart.split('T')[0]

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('tenant_id')
    .eq('module', 'hrtrack')
    .eq('is_active', true)
  const tenantIds = [...new Set((subs || []).map((s) => s.tenant_id))]

  const summary = {
    tenantsChecked: tenantIds.length,
    digestsSent: 0,
    employeesFlagged: 0,
    errors: [] as { tenantId: string; error: string }[],
  }

  for (const tenantId of tenantIds) {
    const { data: checks } = await supabaseAdmin
      .from('wfh_activity_checks')
      .select('user_id, users(email)')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .gte('prompted_at', todayStart)

    if (!checks || checks.length === 0) continue

    const countByEmail = new Map<string, number>()
    for (const check of checks) {
      const email = (check as unknown as { users: { email: string } | null }).users?.email
      if (!email) continue
      countByEmail.set(email, (countByEmail.get(email) || 0) + 1)
    }

    const entries: WfhDigestEntry[] = Array.from(countByEmail.entries()).map(([email, unconfirmedCount]) => ({
      email,
      unconfirmedCount,
    }))
    if (entries.length === 0) continue

    try {
      await sendWfhDigestEmail(tenantId, dateLabel, entries)
      summary.digestsSent++
      summary.employeesFlagged += entries.length
    } catch (err) {
      const message = err instanceof EmailSendError ? err.message : (err as Error).message
      summary.errors.push({ tenantId, error: message })
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}
