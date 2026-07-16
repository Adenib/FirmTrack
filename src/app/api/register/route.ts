import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { DEFAULT_ACCOUNTS } from '@/lib/accounttrack/default-accounts'
import { DEFAULT_LEAVE_TYPES } from '@/lib/hrtrack/default-leave-types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

export async function POST(request: Request) {
  try {
    const { userId, email, orgName } = await request.json()

    if (!userId || !email || !orgName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const slug = slugify(orgName) + '-' + Math.random().toString(36).slice(2, 7)

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: orgName, slug, plan: 'free' })
      .select()
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Could not create organization: ' + orgError?.message }, { status: 500 })
    }

    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        tenant_id: org.id,
        email,
        role: 'owner',
      })

    if (userError) {
      return NextResponse.json({ error: 'Could not create user profile: ' + userError.message }, { status: 500 })
    }

    const freeModules = ['timetrack', 'movementtrack', 'tasktrack', 'billtrack', 'admin']
    const subscriptionRows = freeModules.map((module) => ({
      tenant_id: org.id,
      module,
      tier: 'free',
      is_active: true,
      price_per_user: 0,
    }))

    await supabaseAdmin.from('subscriptions').insert(subscriptionRows)

    const accountRows = DEFAULT_ACCOUNTS.map((a) => ({ tenant_id: org.id, ...a }))
    await supabaseAdmin.from('chart_of_accounts').insert(accountRows)

    const leaveTypeRows = DEFAULT_LEAVE_TYPES.map((lt) => ({ tenant_id: org.id, ...lt }))
    await supabaseAdmin.from('leave_types').insert(leaveTypeRows)

    return NextResponse.json({ success: true, organizationId: org.id })
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error: ' + (err as Error).message }, { status: 500 })
  }
}