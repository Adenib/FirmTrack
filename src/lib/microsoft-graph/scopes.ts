// Requested only for the 'azure' provider (Google needs no extra scopes).
// offline_access is what makes Supabase return a provider_refresh_token
// at all -- without it we'd only ever get a short-lived access_token
// with no way to refresh it once the user's session moves on.
export const MICROSOFT_GRAPH_SCOPES = 'Files.Read Mail.Read offline_access'

export function oauthScopesFor(provider: 'google' | 'azure'): string | undefined {
  return provider === 'azure' ? MICROSOFT_GRAPH_SCOPES : undefined
}
