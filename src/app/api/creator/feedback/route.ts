import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'feedback')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: entries, error } = await supabaseAdmin
    .from('app_feedback')
    .select('id, rating, comment, created_at, tenant_id, user_id')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tenantIds = [...new Set((entries || []).map((e) => e.tenant_id))]
  const userIds = [...new Set((entries || []).map((e) => e.user_id))]

  const [{ data: orgs }, { data: users }] = await Promise.all([
    tenantIds.length
      ? supabaseAdmin.from('organizations').select('id, name').in('id', tenantIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? supabaseAdmin.from('users').select('id, email').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; email: string }[] }),
  ])

  const orgMap = Object.fromEntries((orgs || []).map((o) => [o.id, o.name]))
  const userMap = Object.fromEntries((users || []).map((u) => [u.id, u.email]))

  const feedback = (entries || []).map((e) => ({
    ...e,
    org_name: orgMap[e.tenant_id] || 'Unknown org',
    user_email: userMap[e.user_id] || 'Unknown user',
  }))

  const total = feedback.length
  const average = total ? feedback.reduce((sum, f) => sum + f.rating, 0) / total : 0
  const distribution = [1, 2, 3, 4, 5].map((n) => feedback.filter((f) => f.rating === n).length)

  return NextResponse.json({ feedback, stats: { total, average, distribution } })
}
