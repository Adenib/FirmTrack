import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { notifySalesLead } from '@/lib/sales/notify-lead'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EMAIL_RE = /^\S+@\S+\.\S+$/

// Public, unauthenticated -- a prospect isn't a FirmTrack user yet. The
// returned access_token is the only thing proving ownership of this lead
// on later requests (stored client-side), since there's no Supabase
// session to scope by.
export async function POST(request: Request) {
  const { name, email, phone, message } = await request.json()

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const { data: lead, error } = await supabaseAdmin
    .from('sales_leads')
    .insert({
      name: name.trim(),
      email: email.trim(),
      phone: typeof phone === 'string' ? phone.trim() || null : null,
      message: message.trim(),
    })
    .select('id, access_token, name, email, phone, message, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('sales_messages').insert({
    lead_id: lead.id,
    sender_type: 'lead',
    body: lead.message,
  })

  await notifySalesLead({
    subject: `New sales chat lead: ${lead.name}`,
    html: `
      <p>A website visitor wants to talk to sales.</p>
      <p><strong>Name:</strong> ${lead.name}<br/>
      <strong>Email:</strong> ${lead.email}<br/>
      <strong>Phone:</strong> ${lead.phone || '--'}</p>
      <p><strong>Message:</strong><br/>${lead.message}</p>
    `,
  })

  return NextResponse.json({ lead }, { status: 201 })
}
