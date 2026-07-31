import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendSupportMessage, AiSupportError, type SupportChatMessage } from '@/lib/ai/support-chat'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function loadOwnRequest(tenantId: string, requestId: string) {
  const { data } = await supabaseAdmin
    .from('support_requests')
    .select('*')
    .eq('id', requestId)
    .eq('tenant_id', tenantId)
    .single()
  return data
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const supportRequest = await loadOwnRequest(profile.tenant_id, id)
  if (!supportRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: messages, error } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .eq('request_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const supportRequest = await loadOwnRequest(profile.tenant_id, id)
  if (!supportRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (supportRequest.channel !== 'ai_assisted') {
    return NextResponse.json({ error: 'This request does not use the AI Assistant channel' }, { status: 400 })
  }

  const { body } = await request.json()
  if (!body) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  await supabaseAdmin.from('support_messages').insert({
    tenant_id: profile.tenant_id,
    request_id: id,
    sender_type: 'user',
    sender_user_id: user.id,
    body,
  })

  const { data: allMessages } = await supabaseAdmin
    .from('support_messages')
    .select('sender_type, body')
    .eq('request_id', id)
    .order('created_at', { ascending: true })

  const history: SupportChatMessage[] = (allMessages || []).map((m) => ({
    role: m.sender_type === 'user' ? 'user' : 'assistant',
    content: m.body,
  }))

  try {
    const reply = await sendSupportMessage({
      subject: supportRequest.subject,
      description: supportRequest.description,
      history,
    })
    const { data: aiMessage, error } = await supabaseAdmin
      .from('support_messages')
      .insert({ tenant_id: profile.tenant_id, request_id: id, sender_type: 'ai', body: reply })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ message: aiMessage })
  } catch (err) {
    if (err instanceof AiSupportError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI support chat failed' }, { status: 500 })
  }
}
