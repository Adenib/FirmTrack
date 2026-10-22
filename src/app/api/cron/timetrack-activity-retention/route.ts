import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETENTION_DAYS = 30

// Vercel Cron triggers this with GET and, when CRON_SECRET is set as a
// project env var, automatically sends it as this bearer token -- same
// pattern as src/app/api/cron/doctrack-retention/route.ts.
function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

// Daily pass: soft-delete (never hard-delete) raw activity_log rows older
// than RETENTION_DAYS, but only once they've already been converted into a
// real time entry -- that's where the actual business value now lives, so
// the raw window-title/process-name telemetry behind it no longer needs to
// stay in normal view. Rows never converted (not yet reviewed, or
// deliberately left as drafts) are never touched here regardless of age --
// auto-deleting someone's not-yet-reviewed billable time would be real
// data loss, not cleanup.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: expired, error: selectError } = await supabaseAdmin
    .from('activity_log')
    .select('id')
    .not('converted_to_entry_id', 'is', null)
    .is('deleted_at', null)
    .lt('logged_at', cutoff)

  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 })

  let deletedCount = 0
  for (const row of expired || []) {
    const { error } = await supabaseAdmin
      .from('activity_log')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', row.id)
    if (!error) deletedCount++
  }

  return NextResponse.json({ ok: true, deletedCount })
}
