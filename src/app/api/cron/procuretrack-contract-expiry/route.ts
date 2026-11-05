import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { contractsNeedingAlert } from '@/lib/procuretrack/contract-expiry'
import { notifyContractExpiry } from '@/lib/procuretrack/notify-contract-expiry'
import { PROCURETRACK_APPROVER_ROLES } from '@/lib/procuretrack/roles'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

// Daily pass across every procuretrack-subscribed tenant: alert
// owner/admin/manager at exactly 30/7/1 days before an active contract's
// end_date. Best-effort email -- a send failure for one tenant never
// stops the run for the rest.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('tenant_id')
    .eq('module', 'procuretrack')
    .eq('is_active', true)
  const tenantIds = [...new Set((subs || []).map((s) => s.tenant_id))]

  const summary = { tenantsChecked: tenantIds.length, alertsSent: 0, errors: [] as { tenantId: string; error: string }[] }

  for (const tenantId of tenantIds) {
    const { data: contracts } = await supabaseAdmin
      .from('procuretrack_contracts')
      .select('id, title, end_date')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .not('end_date', 'is', null)

    const due = contractsNeedingAlert(
      (contracts || []).map((c) => ({ id: c.id, title: c.title, endDate: c.end_date as string })),
      today
    )
    if (due.length === 0) continue

    const { data: recipients } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('tenant_id', tenantId)
      .in('role', PROCURETRACK_APPROVER_ROLES)
    const to = (recipients || []).map((r) => r.email).filter(Boolean)
    if (to.length === 0) continue

    const html = `
      <p>The following ProcureTrack contracts are approaching expiry:</p>
      <ul>${due.map((c) => `<li>${c.title} — expires ${c.endDate}</li>`).join('')}</ul>
    `
    const result = await notifyContractExpiry({ to, subject: 'ProcureTrack: contracts approaching expiry', html })
    if (result.sent) summary.alertsSent++
    else if (result.error) summary.errors.push({ tenantId, error: result.error })
  }

  return NextResponse.json({ ok: true, ...summary })
}
