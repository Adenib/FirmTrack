import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { MICROSOFT_GRAPH_SCOPES } from '@/lib/microsoft-graph/scopes'
import { notifyNewSignup } from '@/lib/creator/notify-signup'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  // Capture the Microsoft Graph token at the moment it's issued --
  // Supabase exposes provider_token/provider_refresh_token only on this
  // initial exchange and never refreshes them itself, so this is the
  // only chance to store them for later use (browsing OneDrive isn't
  // something that only happens at login time). Fires for both a fresh
  // Microsoft sign-in and a "Connect Microsoft" linkIdentity() round-trip.
  if (
    user.app_metadata?.provider === 'azure' &&
    sessionData.session.provider_token &&
    sessionData.session.provider_refresh_token
  ) {
    await supabaseAdmin.from('microsoft_graph_tokens').upsert({
      user_id: user.id,
      access_token: sessionData.session.provider_token,
      refresh_token: sessionData.session.provider_refresh_token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Microsoft access tokens are ~1hr; refreshed proactively via getValidGraphToken
      scope: MICROSOFT_GRAPH_SCOPES,
      updated_at: new Date().toISOString(),
    })
  }

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

  // No profile at this auth id -- but an admin may have pre-provisioned
  // this person (e.g. a bulk staff import) under a placeholder id before
  // their first real sign-in. OAuth issues its own auth id independent of
  // that placeholder, so match by email instead of assuming this is a
  // brand-new signup. If found, claim it: insert a fresh `users` row under
  // the real auth id, repoint whatever the placeholder id could already
  // have accumulated (lawyer/accounts-staff profiles, payroll records --
  // nothing else is possible before a first login), then remove the
  // placeholder. Order matters for FK correctness: the new row must exist
  // before anything is repointed to it, and the placeholder can only be
  // deleted once nothing references it anymore.
  if (user.email) {
    const { data: preProvisioned } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', user.email)
      .maybeSingle()

    if (preProvisioned && preProvisioned.id !== user.id) {
      const oldId = preProvisioned.id
      const { id: _oldId, ...profileRest } = preProvisioned
      const { error: claimInsertError } = await supabaseAdmin
        .from('users')
        .insert({ ...profileRest, id: user.id })

      if (claimInsertError) {
        console.error('auth/callback: failed to claim pre-provisioned profile', claimInsertError)
        return NextResponse.redirect(`${origin}/login?error=profile_creation_failed`)
      }

      await supabaseAdmin.from('lawyers').update({ user_id: user.id }).eq('user_id', oldId)
      await supabaseAdmin.from('accounts_staff').update({ user_id: user.id }).eq('user_id', oldId)
      await supabaseAdmin.from('payroll_salaries').update({ user_id: user.id }).eq('user_id', oldId)
      await supabaseAdmin.from('payroll_salaries').update({ created_by: user.id }).eq('created_by', oldId)

      await supabaseAdmin.from('users').delete().eq('id', oldId)
      await supabaseAdmin.auth.admin.deleteUser(oldId).catch(() => {})

      return NextResponse.redirect(`${origin}${next}`)
    }
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

  // is_active starts false -- every new signup is created pending until a
  // FirmTrack team member approves it via the Creator Console
  // (src/app/creator/signups/). Enforced at login and on every request
  // (middleware.ts). Mirrors /api/register's identical org-creation shape.
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName, slug, plan: 'free', is_active: false })
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

  await notifyNewSignup({ orgName, email: user.email || '', orgId: org.id })

  return NextResponse.redirect(`${origin}/pending-approval`)
}