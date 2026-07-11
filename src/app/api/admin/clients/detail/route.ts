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
  const clientId = searchParams.get('id')
  const type = searchParams.get('type') || 'client'

  if (type === 'client') {
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('tenant_id', profile.tenant_id)
      .single()
    return NextResponse.json({ client })
  }

  if (type === 'matters') {
    const { data: matters } = await supabaseAdmin
      .from('matters')
      .select('*')
      .eq('client_id', clientId)
      .eq('tenant_id', profile.tenant_id)
      .order('open_date', { ascending: false })
    return NextResponse.json({ matters })
  }

  if (type === 'users') {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, role')
      .eq('tenant_id', profile.tenant_id)
    return NextResponse.json({ users })
  }

  if (type === 'exchange_rate') {
    const { data } = await supabaseAdmin
      .from('exchange_rates')
      .select('rate')
      .eq('is_platform', true)
      .single()
    return NextResponse.json({ exchange_rate: data })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}