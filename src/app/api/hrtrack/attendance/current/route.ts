import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function hashKey(rawKey: string) {
  return crypto.createHash('sha256').update(rawKey).digest('hex')
}

// Called by the desktop agent to learn whether it should arm WFH idle
// monitoring -- only when the caller currently has an open ('remote')
// attendance_records row. Same x-api-key auth as /api/timetrack/activity.
export async function GET(request: Request) {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 })

  const { data: keyRow } = await supabaseAdmin
    .from('agent_api_keys')
    .select('id, tenant_id, user_id, revoked_at')
    .eq('key_hash', hashKey(apiKey))
    .single()

  if (!keyRow || keyRow.revoked_at) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })
  }

  const { data: record } = await supabaseAdmin
    .from('attendance_records')
    .select('id, status, clock_in_at')
    .eq('tenant_id', keyRow.tenant_id)
    .eq('user_id', keyRow.user_id)
    .is('clock_out_at', null)
    .order('clock_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  await supabaseAdmin
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)

  return NextResponse.json({ record: record || null })
}
