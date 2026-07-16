import { createClient } from '@supabase/supabase-js'
import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import RevenueClient from './revenue-client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function RevenuePage() {
  await requireCreatorPageAccess('revenue')

  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('tenant_id, module, tier, is_active, price_per_user, billing_cycle_start, billing_cycle_end, annual_billing, created_at')

  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name, plan')

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('tenant_id')

  return (
    <RevenueClient
      subscriptions={subscriptions || []}
      orgs={orgs || []}
      users={users || []}
    />
  )
}