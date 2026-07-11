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
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { orgId, module, is_active, tier } = await request.json()

  // Check if subscription row exists
  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('tenant_id', orgId)
    .eq('module', module)
    .single()

  if (existing) {
    // Update existing row
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ is_active })
      .eq('tenant_id', orgId)
      .eq('module', module)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Insert new row
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        tenant_id: orgId,
        module,
        tier: tier || 'basic',
        is_active: true,
        price_per_user: 0,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}