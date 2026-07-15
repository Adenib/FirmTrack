import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const supabase = await createClient()
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

    // Supabase never reveals whether the email is registered (returns
    // success either way) — preserved here rather than swallowed, so the
    // frontend can't be used to enumerate accounts by checking a status code.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error: ' + (err as Error).message }, { status: 500 })
  }
}
