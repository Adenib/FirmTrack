import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Where to send an already-provisioned user once the code exchange
  // succeeds -- e.g. /account, when this is a "Connect Google/Microsoft"
  // linkIdentity() round-trip rather than a fresh sign-in.
  const next = searchParams.get('next') || '/dashboard'

  if (!code) {
    // Supabase forwards the provider/GoTrue error here instead of a code
    // when the OAuth round-trip fails (denied consent, misconfigured
    // provider, redirect URI mismatch, etc.) -- surface it instead of a
    // generic "missing_code" so a failure is actually diagnosable.
    const oauthError = searchParams.get('error_description') || searchParams.get('error')
    console.error('auth/callback: no code param', { oauthError, url: request.url })
    return NextResponse.redirect(
      `${origin}/login?error=oauth_failed${oauthError ? `&detail=${encodeURIComponent(oauthError)}` : ''}`
    )
  }

  const supabase = await createClient()

  const { data: sessionData, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(code)

  if (sessionError || !sessionData.user) {
    console.error('auth/callback: exchangeCodeForSession failed', sessionError)
    return NextResponse.redirect(
      `${origin}/login?error=oauth_failed${sessionError ? `&detail=${encodeURIComponent(sessionError.message)}` : ''}`
    )
  }

  const user = sessionData.user

  // Check if this user already has a profile (avoids duplicate org creation
  // if they click the confirmation link twice)
  const { data: existingProfile } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existingProfile) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  // No profile yet and no org name to work with (the OAuth sign-in/sign-up
  // flow -- Google/Microsoft's consent screen happens before we can ask
  // for one) -- send them to collect it instead of silently creating an
  // org with a placeholder name.
  if (!user.user_metadata?.org_name) {
    return NextResponse.redirect(`${origin}/complete-signup`)
  }

  const orgName = user.user_metadata.org_name as string
  const slug = slugify(orgName) + '-' + Math.random().toString(36).slice(2, 7)

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName, slug, plan: 'free' })
    .select()
    .single()

  if (orgError || !org) {
    return NextResponse.redirect(`${origin}/login?error=org_creation_failed`)
  }

  const { error: userError } = await supabase
    .from('users')
    .insert({
      id: user.id,
      tenant_id: org.id,
      email: user.email,
      role: 'owner',
    })

  if (userError) {
    return NextResponse.redirect(`${origin}/login?error=profile_creation_failed`)
  }

  const freeModules = ['timetrack', 'movementtrack', 'tasktrack', 'billtrack', 'admin']
  const subscriptionRows = freeModules.map((module) => ({
    tenant_id: org.id,
    module,
    tier: 'free',
    is_active: true,
    price_per_user: 0,
  }))

  await supabase.from('subscriptions').insert(subscriptionRows)

  return NextResponse.redirect(`${origin}/dashboard`)
}