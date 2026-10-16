import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'
import { sendSalesEmail } from '@/lib/sales/notify-lead'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireSalesAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'sales')) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { admin }
}

const STATUSES = ['open', 'contacted', 'closed']

// A typing ping goes stale (reads back as "not typing") after this long
// with no further keystroke -- no explicit "stopped typing" signal needed.
const TYPING_WINDOW_MS = 4000

function isTypingRecently(timestamp: string | null): boolean {
  if (!timestamp) return false
  return Date.now() - new Date(timestamp).getTime() < TYPING_WINDOW_MS
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireSalesAccess()
  if (error) return error

  const { data: lead, error: fetchError } = await supabaseAdmin
    .from('sales_leads')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data: messages } = await supabaseAdmin
    .from('sales_messages')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    lead,
    messages: messages || [],
    leadTyping: isTypingRecently(lead.lead_typing_at),
  })
}

// A sales agent replying and/or updating status/assignment.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin } = await requireSalesAccess()
  if (error) return error

  const { data: lead } = await supabaseAdmin
    .from('sales_leads').select('id, name, assigned_to').eq('id', id).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { body, status, assigned_to } = await request.json()

  if (status !== undefined && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 })
  }

  // An explicit hand-off to a specific colleague -- validated against the
  // same "can actually act on a sales lead" bar as this route itself.
  let reassignedAgent: { email: string } | null = null
  if (assigned_to !== undefined) {
    const { data: targetAdmin } = await supabaseAdmin
      .from('platform_admins')
      .select('email, role, status')
      .eq('id', assigned_to)
      .single()
    if (!targetAdmin || targetAdmin.status === 'inactive' || !canAccessCreatorPage(targetAdmin.role, 'sales')) {
      return NextResponse.json({ error: 'assigned_to must be an active platform admin with sales access' }, { status: 400 })
    }
    reassignedAgent = targetAdmin
  }

  if (body) {
    await supabaseAdmin.from('sales_messages').insert({
      lead_id: id,
      sender_type: 'agent',
      sender_agent_id: admin!.id,
      body,
    })
  }

  if (status || assigned_to !== undefined) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (status) {
      update.status = status
      if (status === 'closed') update.closed_at = new Date().toISOString()
    }
    // Explicit reassignment wins; otherwise a plain status change still
    // self-assigns to whoever's acting on it.
    update.assigned_to = assigned_to !== undefined ? assigned_to : (status ? admin!.id : undefined)
    if (update.assigned_to === undefined) delete update.assigned_to

    const { data, error: updateError } = await supabaseAdmin
      .from('sales_leads')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    if (reassignedAgent && assigned_to !== lead.assigned_to) {
      await sendSalesEmail({
        to: reassignedAgent.email,
        subject: `Sales lead reassigned to you: ${lead.name}`,
        html: `<p>A sales chat lead ("${lead.name}") has been reassigned to you on FirmTrack Creator Console.</p>`,
      })
    }

    return NextResponse.json({ lead: data })
  }

  return NextResponse.json({ ok: true })
}
