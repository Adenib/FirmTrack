import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lets /account tell "connected, file access granted" apart from
// "connected before Files.Read was requested -- needs to reconnect."
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: row } = await supabaseAdmin
    .from('microsoft_graph_tokens')
    .select('scope')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    hasFileAccess: !!row?.scope.includes('Files.Read'),
    hasMailAccess: !!row?.scope.includes('Mail.Read'),
    hasSitesAccess: !!row?.scope.includes('Sites.Read.All'),
  })
}
