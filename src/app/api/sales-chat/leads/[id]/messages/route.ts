import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { notifySalesLead } from '@/lib/sales/notify-lead'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A typing ping goes stale (reads back as "not typing") after this long
// with no further keystroke -- no explicit "stopped typing" signal needed.
const TYPING_WINDOW_MS = 4000

function isTypingRecently(timestamp: string | null): boolean {
  if (!timestamp) return false
  return Date.now() - new Date(timestamp).getTime() < TYPING_WINDOW_MS
}

async function loadLeadByToken(id: string, token: string | null) {
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('sales_leads')
    .select('*')
    .eq('id', id)
    .eq('access_token', token)
    .single()
  return data
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const lead = await loadLeadByToken(id, searchParams.get('token'))
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: messages, error } = await supabaseAdmin
    .from('sales_messages')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    messages,
    status: lead.status,
    agentTyping: isTypingRecently(lead.agent_typing_at),
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token, body } = await request.json()
  const lead = await loadLeadByToken(id, token)
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  const { data: message, error } = await supabaseAdmin
    .from('sales_messages')
    .insert({ lead_id: id, sender_type: 'lead', body: body.trim() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifySalesLead({
    subject: `New message from sales chat lead: ${lead.name}`,
    html: `<p>${body.trim()}</p><p>Lead: ${lead.name} (${lead.email})</p>`,
  })

  return NextResponse.json({ message })
}
