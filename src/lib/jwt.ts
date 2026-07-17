// No signature verification here -- the token was already cryptographically
// validated by supabase.auth.getUser() elsewhere in the same request; this
// only reads an extra claim (issued-at) from a token already trusted.
// atob() rather than Buffer since this runs in middleware's Edge Runtime,
// which doesn't have Node's Buffer.
export function decodeJwtIssuedAt(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    const claims = JSON.parse(json)
    return typeof claims.iat === 'number' ? claims.iat : null
  } catch {
    return null
  }
}
