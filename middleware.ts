import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { decodeJwtIssuedAt } from '@/lib/jwt'

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

  if ((!user || sessionRevoked) && !request.nextUrl.pathname.startsWith('/api') &&
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/register') &&
      !request.nextUrl.pathname.startsWith('/auth/callback') &&
      !request.nextUrl.pathname.startsWith('/forgot-password') &&
      !request.nextUrl.pathname.startsWith('/reset-password')) {
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

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
