import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// cache() ensures this only runs once per request, even with parallel rendering
const getUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user, error }
})

export async function getUserContext() {
  const { supabase, user } = await getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*, organizations(id, name, plan)')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('module, tier, is_active')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)

  const activeModules = new Set((subscriptions || []).map((s) => s.module))

  return {
    user,
    profile,
    organization: profile.organizations,
    activeModules,
  }
}
