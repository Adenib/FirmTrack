import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { draftTimeEntry, AiDraftError } from '@/lib/ai/time-entry-draft'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Two gates, both required, checked in this order (cheapest first):
// 1. The firm's own timetrack_settings.ai_drafting_enabled switch
//    (owner/admin-controlled, off by default -- see /api/timetrack/settings).
// 2. Whether ANTHROPIC_API_KEY is configured at all (platform-level;
//    draftTimeEntry() itself throws AiDraftError if it's absent).
// Re-fetches the event/matter/task-codes server-side rather than
// trusting client-provided data, matching this app's convention for
// anything that touches billing.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: settings } = await supabaseAdmin
    .from('timetrack_settings')
    .select('ai_drafting_enabled')
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  if (!settings?.ai_drafting_enabled) {
    return NextResponse.json({ error: 'AI drafting is not enabled for this firm' }, { status: 403 })
  }

  const { calendar_event_id } = await request.json()
  if (!calendar_event_id) {
    return NextResponse.json({ error: 'calendar_event_id is required' }, { status: 400 })
  }

  const { data: event } = await supabaseAdmin
    .from('ft_calendar_events')
    .select('title, description, start_at, end_at, linked_module, linked_id')
    .eq('id', calendar_event_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!event) return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 })

  let matterCaseName = 'this matter'
  if (event.linked_module === 'matters' && event.linked_id) {
    const { data: matter } = await supabaseAdmin
      .from('matters').select('case_name').eq('id', event.linked_id).single()
    if (matter) matterCaseName = matter.case_name
  }

  const durationHours = Math.max(0, (new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 3600000)

  const { data: taskCodes } = await supabaseAdmin
    .from('task_codes')
    .select('code, description')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)

  try {
    const draft = await draftTimeEntry({
      eventTitle: event.title,
      eventDescription: event.description,
      matterCaseName,
      durationHours: Math.round(durationHours * 100) / 100,
      taskCodes: taskCodes || [],
    })
    return NextResponse.json({ ...draft, durationHours: Math.round(durationHours * 100) / 100 })
  } catch (err) {
    if (err instanceof AiDraftError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI drafting failed' }, { status: 500 })
  }
}
