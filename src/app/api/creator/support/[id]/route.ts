import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'

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

  return NextResponse.json({ request: supportRequest, messages: messages || [] })
}

// A creator support agent replying and/or updating status/assignment.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin } = await requireSupportAccess()
  if (error) return error

  const { data: supportRequest } = await supabaseAdmin
    .from('support_requests').select('id, tenant_id').eq('id', id).single()
  if (!supportRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { body, status } = await request.json()

  if (status !== undefined && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 })
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

  if (status) {
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      assigned_to: admin!.id,
    }
    if (status === 'resolved') update.resolved_at = new Date().toISOString()

    const { data, error: updateError } = await supabaseAdmin
      .from('support_requests')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ request: data })
  }

  return NextResponse.json({ ok: true })
}
