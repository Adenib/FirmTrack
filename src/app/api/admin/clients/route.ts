import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No profile found' }, { status: 403 })
  }

  const { name, email, phone, company, notes, billing_currency } = await request.json()

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  let effectiveCurrency = billing_currency
  if (!effectiveCurrency) {
    const { data: org } = await supabaseAdmin
      .from('organizations').select('base_currency').eq('id', profile.tenant_id).single()
    effectiveCurrency = org?.base_currency || 'NGN'
  }

  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .insert({
      tenant_id: profile.tenant_id,
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      notes: notes || null,
      billing_currency: effectiveCurrency,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ client })
}