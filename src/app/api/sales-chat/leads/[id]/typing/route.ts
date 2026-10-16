import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Pinged by the lead's chat input (client-side throttled) -- bumps a
// timestamp, read back as "is typing" by whoever polls within the last
// few seconds. No explicit "stopped typing" signal needed; it just goes
// stale.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await request.json()
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('sales_leads')
    .update({ lead_typing_at: new Date().toISOString() })
    .eq('id', id)
    .eq('access_token', token)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
