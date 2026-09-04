import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { sendExpertAgentMessage, AiExpertAgentError, type ExpertAgentChatMessage } from '@/lib/ai/expert-agent-chat'
import { MAX_HISTORY_MESSAGES, MONTHLY_AI_MESSAGE_LIMIT } from '@/lib/ai/usage-limits'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function loadOwnAgent(tenantId: string, agentId: string) {
  const { data } = await supabaseAdmin
    .from('ai_expert_agents')
    .select('*')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data
}

// This tenant's user-sent messages to this specific agent so far this
// calendar month -- its own 300/tenant/month budget, separate from
// Support Assistant's (see monthlyAiMessageCount in the support route).
async function monthlyAiMessageCount(tenantId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { count } = await supabaseAdmin
    .from('ai_expert_agent_messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('sender_type', 'user')
    .gte('created_at', startOfMonth.toISOString())

  return count || 0
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const agent = await loadOwnAgent(profile.tenant_id, id)
  if (!agent) return NextResponse.json({ error: 'Expert agent not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const requestedUserId = searchParams.get('user_id') || user.id
  if (requestedUserId !== user.id && agent.visibility !== 'shared') {
    return NextResponse.json({ error: 'This conversation is private' }, { status: 403 })
  }

  const { data: messages, error } = await supabaseAdmin
    .from('ai_expert_agent_messages')
    .select('*')
    .eq('agent_id', id)
    .eq('user_id', requestedUserId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'aitrack'))) {
    return NextResponse.json({ error: 'AITrack is not active for this tenant' }, { status: 403 })
  }

  const agent = await loadOwnAgent(profile.tenant_id, id)
  if (!agent) return NextResponse.json({ error: 'Expert agent not found' }, { status: 404 })

  const { body } = await request.json()
  if (!body) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  // Checked before saving anything -- an over-quota message is rejected
  // outright, not saved-then-unanswered.
  const usedThisMonth = await monthlyAiMessageCount(profile.tenant_id)
  if (usedThisMonth >= MONTHLY_AI_MESSAGE_LIMIT) {
    return NextResponse.json({
      error: `This firm has reached its monthly Expert Agent usage limit (${MONTHLY_AI_MESSAGE_LIMIT} messages). Please try again next month.`,
    }, { status: 429 })
  }

  // Always appends to the caller's OWN conversation, regardless of the
  // agent's visibility -- you can read others' shared conversations,
  // never post into them.
  await supabaseAdmin.from('ai_expert_agent_messages').insert({
    tenant_id: profile.tenant_id,
    agent_id: id,
    user_id: user.id,
    sender_type: 'user',
    body,
  })

  const { data: allMessages } = await supabaseAdmin
    .from('ai_expert_agent_messages')
    .select('sender_type, body')
    .eq('agent_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const recentMessages = (allMessages || []).slice(-MAX_HISTORY_MESSAGES)
  const history: ExpertAgentChatMessage[] = recentMessages.map((m) => ({
    role: m.sender_type === 'user' ? 'user' : 'assistant',
    content: m.body,
  }))

  try {
    const { reply, usage } = await sendExpertAgentMessage({
      agentName: agent.name,
      agentInstructions: agent.instructions,
      history,
    })
    const { data: aiMessage, error } = await supabaseAdmin
      .from('ai_expert_agent_messages')
      .insert({ tenant_id: profile.tenant_id, agent_id: id, user_id: user.id, sender_type: 'ai', body: reply })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('ai_usage_log').insert({
      tenant_id: profile.tenant_id,
      feature: 'expert_agent_chat',
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    })

    return NextResponse.json({ message: aiMessage })
  } catch (err) {
    if (err instanceof AiExpertAgentError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI expert agent chat failed' }, { status: 500 })
  }
}
