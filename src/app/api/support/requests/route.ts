import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { notifySupportTicket } from '@/lib/support/notify-ticket'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: requests, error } = await supabaseAdmin
    .from('support_requests')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { subject, description, channel, severity } = await request.json()

  if (!subject || !description) {
    return NextResponse.json({ error: 'subject and description are required' }, { status: 400 })
  }
  if (channel !== 'standard' && channel !== 'ai_assisted') {
    return NextResponse.json({ error: 'channel must be "standard" or "ai_assisted"' }, { status: 400 })
  }

  // Defense-in-depth alongside the UI already disabling this option --
  // the AI channel requires a real, active aitrack subscription (formerly
  // its own 'ai_support' module -- existing ai_support subscribers were
  // grandfathered onto aitrack by the migration that introduced it).
  if (channel === 'ai_assisted' && !(await hasActiveModule(profile.tenant_id, 'aitrack'))) {
    return NextResponse.json({ error: 'AI Support Assistant is not subscribed for this firm' }, { status: 403 })
  }

  const { data: created, error } = await supabaseAdmin
    .from('support_requests')
    .insert({
      tenant_id: profile.tenant_id,
      created_by: user.id,
      subject,
      description,
      channel,
      severity: ['A', 'B', 'C'].includes(severity) ? severity : 'C',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (channel === 'standard') {
    await notifySupportTicket({
      subject: `New support request: ${subject}`,
      html: `<p><strong>${subject}</strong></p><p>${description}</p><p>Request ID: ${created.id}</p>`,
    })
  }

  return NextResponse.json({ request: created })
}
