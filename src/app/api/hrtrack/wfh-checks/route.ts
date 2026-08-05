import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WFH_PRIVILEGED = ['owner', 'admin', 'hr']

function hashKey(rawKey: string) {
  return crypto.createHash('sha256').update(rawKey).digest('hex')
}

// Called by the desktop agent when it shows the "Are you still working
// from home?" popup -- creates the 'pending' row the popup's click (or
// lack of one) will later resolve. Same x-api-key auth as
// /api/timetrack/activity.
export async function POST(request: Request) {
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

  const { attendance_record_id } = await request.json()
  if (!attendance_record_id) {
    return NextResponse.json({ error: 'attendance_record_id is required' }, { status: 400 })
  }

  const { data: record } = await supabaseAdmin
    .from('attendance_records')
    .select('id')
    .eq('id', attendance_record_id)
    .eq('tenant_id', keyRow.tenant_id)
    .eq('user_id', keyRow.user_id)
    .is('clock_out_at', null)
    .eq('status', 'remote')
    .maybeSingle()

  if (!record) {
    return NextResponse.json({ error: 'No matching open remote attendance record for this user' }, { status: 400 })
  }

  const { data: check, error } = await supabaseAdmin
    .from('wfh_activity_checks')
    .insert({
      tenant_id: keyRow.tenant_id,
      user_id: keyRow.user_id,
      attendance_record_id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)

  return NextResponse.json({ check })
}

// Web app view for HR/owner/admin -- today's unconfirmed WFH checks,
// tenant-wide, live (not just the once-a-day digest email).
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !WFH_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'

  const { data: checks, error } = await supabaseAdmin
    .from('wfh_activity_checks')
    .select('id, prompted_at, status, responded_at, users(email)')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'pending')
    .gte('prompted_at', todayStart)
    .order('prompted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checks })
}
