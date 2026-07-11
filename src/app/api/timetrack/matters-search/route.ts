import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()

  let query = supabaseAdmin
    .from('matters')
    .select('id, matter_id, case_name, client_id, rate_type, status, clients(name)')
    .eq('tenant_id', profile.tenant_id)
    .order('open_date', { ascending: false })
    .limit(20)

  if (q) {
    query = query.or(`matter_id.ilike.%${q}%,case_name.ilike.%${q}%`)
  }

  const { data: matters, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ matters })
}
