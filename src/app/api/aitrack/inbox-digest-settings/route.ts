import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Per-user opt-in for the AITrack daily inbox digest cron. Connecting
// Microsoft 365 authorizes DocTrack's linking feature -- it doesn't imply
// consent to a daily AI summary of the whole inbox, so this is a separate
// toggle, off by default, and requires an existing Mail.Read connection
// (the toggle has nothing to turn on without one).
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: row } = await supabaseAdmin
    .from('microsoft_graph_tokens')
    .select('scope, ai_inbox_digest_enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    hasMailAccess: !!row?.scope.includes('Mail.Read'),
    enabled: !!row?.ai_inbox_digest_enabled,
  })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'aitrack'))) {
    return NextResponse.json({ error: 'AITrack is not active for this tenant' }, { status: 403 })
  }

  const { enabled } = await request.json()
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 })
  }

  const { data: row } = await supabaseAdmin
    .from('microsoft_graph_tokens')
    .select('scope')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!row || !row.scope.includes('Mail.Read')) {
    return NextResponse.json({ error: 'Connect Microsoft with mail access before enabling the inbox digest' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('microsoft_graph_tokens')
    .update({ ai_inbox_digest_enabled: enabled })
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enabled })
}
