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

// Called by the desktop agent when the "Are you still working from home?"
// popup's button is clicked. Same x-api-key auth as /api/timetrack/activity.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const { data: check, error } = await supabaseAdmin
    .from('wfh_activity_checks')
    .update({ status: 'confirmed', responded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', keyRow.tenant_id)
    .eq('user_id', keyRow.user_id)
    .select()
    .single()

  if (error || !check) return NextResponse.json({ error: 'Check not found' }, { status: 404 })

  await supabaseAdmin
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)

  return NextResponse.json({ check })
}
