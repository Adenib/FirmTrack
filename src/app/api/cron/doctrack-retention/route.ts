import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Vercel Cron triggers this with GET and, when CRON_SECRET is set as a
// project env var, automatically sends it as this bearer token -- same
// pattern as src/app/api/cron/billtrack-daily/route.ts.
function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

// Daily pass: for every tenant that has set a retention_days value,
// soft-delete (never hard-delete) documents older than that window.
// A tenant with no doctrack_settings row, or retention_days left null,
// keeps everything forever -- retention is opt-in, not a default.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: settingsRows } = await supabaseAdmin
    .from('doctrack_settings')
    .select('tenant_id, retention_days')
    .not('retention_days', 'is', null)

  let deletedCount = 0
  for (const settings of settingsRows || []) {
    const cutoff = new Date(Date.now() - settings.retention_days * 24 * 60 * 60 * 1000).toISOString()

    const { data: expired } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('tenant_id', settings.tenant_id)
      .is('deleted_at', null)
      .lt('created_at', cutoff)

    for (const doc of expired || []) {
      await supabaseAdmin.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', doc.id)
      await supabaseAdmin.from('document_events').insert({
        tenant_id: settings.tenant_id,
        document_id: doc.id,
        event_type: 'deleted',
        metadata: { reason: 'retention_policy' },
      })
      deletedCount++
    }
  }

  return NextResponse.json({ ok: true, deletedCount })
}
