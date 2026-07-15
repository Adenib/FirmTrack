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

  const { data: requesterProfile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!requesterProfile || !['owner', 'admin'].includes(requesterProfile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { email, role, password } = await request.json()

  if (!email || !role || !password) {
    return NextResponse.json({ error: 'email, role, and password are required' }, { status: 400 })
  }

  const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !newAuthUser.user) {
    return NextResponse.json({ error: createError?.message || 'Could not create user' }, { status: 500 })
  }

  const { error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id: newAuthUser.user.id,
      tenant_id: requesterProfile.tenant_id,
      email,
      role,
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: newAuthUser.user.id })
}