import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SETTINGS_KEY = 'signup_gate_paused'

// Backs the Creator Console's pause/unpause control for the new-signup
// approval gate. Missing row (shouldn't happen once the migration seeds
// it, but a read-time default is cheap insurance) is treated the same
// as 'false' -- the gate stays on by default.
export async function isSignupGatePaused(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('platform_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  return data?.value === 'true'
}

export async function setSignupGatePaused(paused: boolean): Promise<void> {
  await supabaseAdmin
    .from('platform_settings')
    .upsert(
      { key: SETTINGS_KEY, value: paused ? 'true' : 'false', updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
}
