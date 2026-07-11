import { createClient } from '@supabase/supabase-js'
import { getCreatorContext } from '@/lib/get-creator-context'
import OrgManager from './org-manager'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await getCreatorContext()
  const { id } = await params

  const { data: org } = await supabaseAdmin
    .from('organizations').select('*').eq('id', id).single()

  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions').select('*').eq('tenant_id', id)

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, email, role, is_active, created_at')
    .eq('tenant_id', id)

  if (!org) return <div className="p-8 text-gray-500">Not found.</div>

  return (
    <OrgManager
      org={org}
      subscriptions={subscriptions || []}
      users={users || []}
    />
  )
}