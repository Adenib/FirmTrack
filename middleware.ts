import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { decodeJwtIssuedAt } from '@/lib/jwt'

// Service-role, used only for the organizations.mfa_required lookup below
// -- unlike users.sessions_revoked_at (a self-select policy already
// proven to work via the session-scoped client elsewhere in this app),
// there's no confirmed RLS select policy on organizations for a regular
// tenant member. Reading it through the session-scoped client and having
// RLS silently return no row would make mfa_required look falsy and fail
// OPEN (skip enrollment enforcement entirely) -- reading it via the
// admin client guarantees the real value either way.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Supabase's own admin ban API doesn't invalidate an already-issued
  // access token (confirmed empirically -- only token refresh gets
  // blocked), so "sign out everywhere" is enforced here instead: any
  // token issued before sessions_revoked_at is treated as logged out,
  // caught on this user's very next request through middleware.
  let sessionRevoked = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('sessions_revoked_at').eq('id', user.id).single()
    if (profile?.sessions_revoked_at) {
      const { data: { session } } = await supabase.auth.getSession()
      const iat = session ? decodeJwtIssuedAt(session.access_token) : null
      if (iat !== null && iat * 1000 < new Date(profile.sessions_revoked_at).getTime()) {
        sessionRevoked = true
        await supabase.auth.signOut()
      }
    }
  }

  const path = request.nextUrl.pathname
  const exemptFromAuthRedirect =
    path.startsWith('/api') ||
    path.startsWith('/login') ||
    path.startsWith('/register') ||
    path.startsWith('/auth/callback') ||
    path.startsWith('/forgot-password') ||
    path.startsWith('/reset-password') ||
    path.startsWith('/complete-signup') ||
    path.startsWith('/terms') ||
    path.startsWith('/mfa/enroll') ||
    path.startsWith('/mfa/challenge')

  if ((!user || sessionRevoked) && !exemptFromAuthRedirect) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    // Carries forward the cookie-clearing from signOut() above (applied
    // to supabaseResponse via the ssr client's setAll callback) -- a bare
    // new NextResponse.redirect() wouldn't include it, leaving the
    // now-invalid cookie in the browser to keep tripping this same check
    // on every subsequent request instead of a clean logged-out state.
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie)
    }
    return redirectResponse
  }

  // MFA gate: a valid, non-revoked session that hasn't completed its
  // second factor yet (or hasn't enrolled one, where the tenant requires
  // it) is sent to /mfa/challenge or /mfa/enroll instead of the app --
  // this is what actually enforces MFA; the login route's own mfaStep
  // response only tells the browser where to go first.
  if (user && !sessionRevoked && !exemptFromAuthRedirect) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    let mfaRedirectPath: string | null = null

    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      mfaRedirectPath = '/mfa/challenge'
    } else if (aal && aal.nextLevel === 'aal1') {
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      const { data: org } = await supabase.from('organizations').select('mfa_required').eq('id', profile?.tenant_id).single()
      if (org?.mfa_required) {
        mfaRedirectPath = '/mfa/enroll'
      }
    }

    if (mfaRedirectPath) {
      const url = request.nextUrl.clone()
      url.pathname = mfaRedirectPath
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
