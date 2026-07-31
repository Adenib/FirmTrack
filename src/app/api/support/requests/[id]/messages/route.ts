import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendSupportMessage, AiSupportError, type SupportChatMessage } from '@/lib/ai/support-chat'
import { MAX_HISTORY_MESSAGES, MONTHLY_AI_MESSAGE_LIMIT } from '@/lib/ai/usage-limits'

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

// This tenant's user-sent AI Assistant messages so far this calendar
// month, across every ai_assisted request -- the usage-cap check.
async function monthlyAiMessageCount(tenantId: string): Promise<number> {
  const { data: aiRequests } = await supabaseAdmin
    .from('support_requests')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'ai_assisted')
  const requestIds = (aiRequests || []).map((r) => r.id)
  if (requestIds.length === 0) return 0

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { count } = await supabaseAdmin
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .in('request_id', requestIds)
    .eq('sender_type', 'user')
    .gte('created_at', startOfMonth.toISOString())

  return count || 0
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

  // Checked before saving anything -- an over-quota message is rejected
  // outright, not saved-then-unanswered.
  const usedThisMonth = await monthlyAiMessageCount(profile.tenant_id)
  if (usedThisMonth >= MONTHLY_AI_MESSAGE_LIMIT) {
    return NextResponse.json({
      error: `This firm has reached its monthly AI Assistant usage limit (${MONTHLY_AI_MESSAGE_LIMIT} messages). Please use the Standard channel, or try again next month.`,
    }, { status: 429 })
  }

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

  // Capped to the most recent turns -- sent as context on every call, so
  // an unbounded thread would make cost grow with conversation length.
  const recentMessages = (allMessages || []).slice(-MAX_HISTORY_MESSAGES)
  const history: SupportChatMessage[] = recentMessages.map((m) => ({
    role: m.sender_type === 'user' ? 'user' : 'assistant',
    content: m.body,
  }))

  try {
    const { reply, usage } = await sendSupportMessage({
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

    await supabaseAdmin.from('ai_usage_log').insert({
      tenant_id: profile.tenant_id,
      feature: 'support_chat',
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    })

    return NextResponse.json({ message: aiMessage })
  } catch (err) {
    if (err instanceof AiSupportError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI support chat failed' }, { status: 500 })
  }
}
