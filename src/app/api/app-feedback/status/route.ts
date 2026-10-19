import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { nextPromptDelayDays } from '@/lib/feedback/cadence'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Checked once per app-layout mount. If this user is due for a prompt,
// advances their schedule immediately (so a reload or a second tab
// doesn't re-trigger it) and tells the caller to show the popup.
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: existing } = await supabaseAdmin
    .from('app_feedback_prompts')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    // First time this user has ever been checked -- start their clock
    // now rather than showing a prompt immediately.
    await supabaseAdmin.from('app_feedback_prompts').insert({ user_id: user.id, tenant_id: profile.tenant_id })
    return NextResponse.json({ shouldShow: false })
  }

  if (existing.opted_out || new Date(existing.next_prompt_at) > new Date()) {
    return NextResponse.json({ shouldShow: false })
  }

  const delayDays = nextPromptDelayDays(existing.prompt_count)
  const nextPromptAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000)

  await supabaseAdmin
    .from('app_feedback_prompts')
    .update({
      prompt_count: existing.prompt_count + 1,
      last_prompted_at: new Date().toISOString(),
      next_prompt_at: nextPromptAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  return NextResponse.json({ shouldShow: true })
}
