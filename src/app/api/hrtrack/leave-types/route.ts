import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: leaveTypes, error } = await supabaseAdmin
    .from('leave_types')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leaveTypes })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'hr'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { name, annual_days } = await request.json()
  if (!name || typeof annual_days !== 'number') {
    return NextResponse.json({ error: 'name and annual_days are required' }, { status: 400 })
  }

  const { data: leaveType, error } = await supabaseAdmin
    .from('leave_types')
    .insert({ tenant_id: profile.tenant_id, name, annual_days })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leaveType })
}
