import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Route-safe counterpart to getUserContext()'s activeModules (which calls
// redirect() and is only safe in page components). Checks the same
// `subscriptions` table (is_active=true for the given module) so API
// routes can 403 instead of relying on the client-side "Locked" nav badge.
export async function hasActiveModule(tenantId: string, moduleKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('module', moduleKey)
    .eq('is_active', true)
    .limit(1)

  return !!data && data.length > 0
}
