import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAYROLL_PRIVILEGED = ['owner', 'admin']

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

// GET reads via the service-role client (bypasses RLS, like every other
// route in this app), so the same self-or-privileged visibility rule the
// payroll_salaries RLS policy encodes must be re-applied here.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (userId && userId !== user.id && !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  let query = supabaseAdmin
    .from('payroll_salaries')
    // users!user_id disambiguates the embed -- payroll_salaries has two
    // FKs to users (user_id and created_by), so a bare "users(email)"
    // is ambiguous to PostgREST and errors.
    .select('*, users!user_id(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('user_id')
    .order('effective_from', { ascending: false })

  if (userId) {
    query = query.eq('user_id', userId)
  } else if (!PAYROLL_PRIVILEGED.includes(profile.role)) {
    query = query.eq('user_id', user.id)
  }

  const { data: salaries, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ salaries })
}

// Always inserts a new effective-dated row, never updates one in place --
// mirrors lawyer_rates, so a historical payroll run stays accurate even
// if a salary is changed after the fact.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile || !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { user_id, amount_usd, effective_from } = await request.json()
  if (!user_id || !(Number(amount_usd) > 0) || !effective_from) {
    return NextResponse.json({ error: 'user_id, a positive amount_usd, and effective_from are required' }, { status: 400 })
  }

  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', user_id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!targetUser) return NextResponse.json({ error: 'Unknown user_id for this tenant' }, { status: 400 })

  const { data: salary, error } = await supabaseAdmin
    .from('payroll_salaries')
    .insert({
      tenant_id: profile.tenant_id,
      user_id,
      amount_usd: Number(amount_usd),
      effective_from,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ salary })
}
