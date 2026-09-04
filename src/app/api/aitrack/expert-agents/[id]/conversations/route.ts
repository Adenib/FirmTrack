import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lets the UI offer a conversation picker for a 'shared' agent without a
// separate threads table -- a conversation is just every message row for
// one (agent_id, user_id) pair, so this groups by user_id directly.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: agent } = await supabaseAdmin
    .from('ai_expert_agents')
    .select('id, visibility')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Expert agent not found' }, { status: 404 })

  let query = supabaseAdmin
    .from('ai_expert_agent_messages')
    .select('user_id, created_at, users(email)')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })

  // Private agents only ever surface the caller's own conversation --
  // never someone else's, even just as a listing entry.
  if (agent.visibility !== 'shared') query = query.eq('user_id', user.id)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byUser = new Map<string, { user_id: string; email: string | null; last_message_at: string }>()
  for (const row of rows || []) {
    if (byUser.has(row.user_id)) continue
    const userRow = Array.isArray(row.users) ? row.users[0] : row.users
    byUser.set(row.user_id, { user_id: row.user_id, email: userRow?.email || null, last_message_at: row.created_at })
  }

  return NextResponse.json({ conversations: Array.from(byUser.values()) })
}
