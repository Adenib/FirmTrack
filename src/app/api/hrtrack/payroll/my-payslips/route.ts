import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Self-service: any authenticated user's own payslips from POSTED runs
// only -- a draft run's numbers aren't final and shouldn't be visible to
// the employee yet.
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: lineItems, error } = await supabaseAdmin
    .from('payroll_line_items')
    .select('*, payroll_runs!inner(status, period_start, period_end, pay_date)')
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', user.id)
    .eq('payroll_runs.status', 'posted')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lineItems: lineItems || [] })
}
