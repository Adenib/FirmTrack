import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function getCreatorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!admin) {
    redirect('/dashboard')
  }

  return { user, admin }
}