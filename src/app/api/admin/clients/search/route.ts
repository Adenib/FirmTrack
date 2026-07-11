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
  const q = searchParams.get('q') || ''

  const { data: clients } = await supabaseAdmin
    .from('clients')
    .select('id, name, company, email, billing_currency, client_sequence, client_year')
    .eq('tenant_id', profile.tenant_id)
    .or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`)
    .order('name')
    .limit(10)

  return NextResponse.json({ clients: clients || [] })
}