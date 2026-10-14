// Requested only for the 'azure' provider (Google needs no extra scopes).
// offline_access is what makes Supabase return a provider_refresh_token
// at all -- without it we'd only ever get a short-lived access_token
// with no way to refresh it once the user's session moves on.
// User.ReadBasic.All added for AssetTrack's SharePoint sync -- a plain
// assignee name from a source list (no '@') is looked up against the
// tenant's Microsoft 365 directory to resolve a real email before
// matching it to a FirmTrack user. Like Sites.Read.All before it, this
// needs tenant admin consent in Entra ID before it actually takes effect
// for a reconnecting user.
export const MICROSOFT_GRAPH_SCOPES = 'Files.Read Mail.Read Sites.Read.All User.ReadBasic.All offline_access'

export function oauthScopesFor(provider: 'google' | 'azure'): string | undefined {
  return provider === 'azure' ? MICROSOFT_GRAPH_SCOPES : undefined
}
