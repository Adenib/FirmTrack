import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { sendSupportEmail } from '@/lib/support/notify-ticket'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireSupportAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'support')) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { admin }
}

const STATUSES = ['open', 'agent_assigned', 'resolved']
const SEVERITIES = ['A', 'B', 'C']

// A typing ping goes stale (reads back as "not typing") after this long
// with no further keystroke -- no explicit "stopped typing" signal needed.
const TYPING_WINDOW_MS = 4000

function isTypingRecently(timestamp: string | null): boolean {
  if (!timestamp) return false
  return Date.now() - new Date(timestamp).getTime() < TYPING_WINDOW_MS
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireSupportAccess()
  if (error) return error

  const { data: supportRequest, error: reqError } = await supabaseAdmin
    .from('support_requests')
    .select('*, organizations(name)')
    .eq('id', id)
    .single()
  if (reqError || !supportRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: messages } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .eq('request_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    request: supportRequest,
    messages: messages || [],
    userTyping: isTypingRecently(supportRequest.user_typing_at),
  })
}

// A creator support agent replying and/or updating status/assignment.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin } = await requireSupportAccess()
  if (error) return error

  const { data: supportRequest } = await supabaseAdmin
    .from('support_requests').select('id, tenant_id, subject, assigned_to').eq('id', id).single()
  if (!supportRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { body, status, severity, assigned_to } = await request.json()

  if (status !== undefined && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 })
  }
  if (severity !== undefined && !SEVERITIES.includes(severity)) {
    return NextResponse.json({ error: `severity must be one of ${SEVERITIES.join(', ')}` }, { status: 400 })
  }

  // An explicit hand-off to a specific colleague -- validated against the
  // same "can actually act on a support request" bar as this route itself,
  // so a request can't be reassigned to someone who'd just get 403'd.
  let reassignedAgent: { email: string } | null = null
  if (assigned_to !== undefined) {
    const { data: targetAdmin } = await supabaseAdmin
      .from('platform_admins')
      .select('email, role, status')
      .eq('id', assigned_to)
      .single()
    if (!targetAdmin || targetAdmin.status === 'inactive' || !canAccessCreatorPage(targetAdmin.role, 'support')) {
      return NextResponse.json({ error: 'assigned_to must be an active platform admin with support access' }, { status: 400 })
    }
    reassignedAgent = targetAdmin
  }

  if (body) {
    await supabaseAdmin.from('support_messages').insert({
      request_id: id,
      tenant_id: supportRequest.tenant_id,
      sender_type: 'agent',
      sender_agent_id: admin!.id,
      body,
    })
  }

  if (status || severity !== undefined || assigned_to !== undefined) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (status) {
      update.status = status
      if (status === 'resolved') update.resolved_at = new Date().toISOString()
    }
    if (severity !== undefined) update.severity = severity
    // Explicit reassignment wins; otherwise a plain status change still
    // self-assigns to whoever's acting on it, same as before.
    update.assigned_to = assigned_to !== undefined ? assigned_to : (status ? admin!.id : undefined)
    if (update.assigned_to === undefined) delete update.assigned_to

    const { data, error: updateError } = await supabaseAdmin
      .from('support_requests')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    if (reassignedAgent && assigned_to !== supportRequest.assigned_to) {
      await sendSupportEmail({
        to: reassignedAgent.email,
        subject: `Support request reassigned to you: ${supportRequest.subject}`,
        html: `<p>A support request ("${supportRequest.subject}") has been reassigned to you on FirmTrack Creator Console.</p>`,
      })
    }

    return NextResponse.json({ request: data })
  }

  return NextResponse.json({ ok: true })
}
