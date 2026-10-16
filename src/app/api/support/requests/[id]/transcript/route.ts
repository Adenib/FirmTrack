import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { sendSupportEmail, supportNotifyEmail } from '@/lib/support/notify-ticket'
import { buildTranscriptEmail } from '@/lib/support/transcript'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Callable by either side of a resolved thread -- the subscriber who
// reported it, or any Creator Console support agent -- since the action
// and its effect (email both parties a copy) are identical either way.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: supportRequest } = await supabaseAdmin
    .from('support_requests')
    .select('*')
    .eq('id', id)
    .single()
  if (!supportRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const isOwningSubscriber = profile?.tenant_id === supportRequest.tenant_id

  let isSupportAgent = false
  if (!isOwningSubscriber) {
    const { data: admin } = await supabaseAdmin
      .from('platform_admins')
      .select('role, status')
      .eq('user_id', user.id)
      .single()
    isSupportAgent = !!admin && admin.status !== 'inactive' && canAccessCreatorPage(admin.role, 'support')
  }

  if (!isOwningSubscriber && !isSupportAgent) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (supportRequest.status !== 'resolved') {
    return NextResponse.json({ error: 'Transcripts are only available once a request is resolved' }, { status: 400 })
  }

  const { data: messages } = await supabaseAdmin
    .from('support_messages')
    .select('sender_type, body, created_at')
    .eq('request_id', id)
    .order('created_at', { ascending: true })

  const { data: reporter } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', supportRequest.created_by)
    .single()

  const { subject, html } = buildTranscriptEmail(supportRequest, messages || [])

  const recipients = [reporter?.email, supportNotifyEmail()].filter((e): e is string => !!e)
  const results = await Promise.all(recipients.map((to) => sendSupportEmail({ to, subject, html })))

  const sent = results.some((r) => r.sent)
  const errors = results.filter((r) => !r.sent).map((r) => r.error).filter(Boolean)

  if (!sent) {
    return NextResponse.json({ sent: false, error: errors[0] || 'Could not send the transcript' }, { status: 502 })
  }
  return NextResponse.json({ sent: true, recipients })
}
