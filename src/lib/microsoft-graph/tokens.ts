import { createClient } from '@supabase/supabase-js'
import { MICROSOFT_GRAPH_SCOPES } from './scopes'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const REFRESH_BUFFER_MS = 5 * 60 * 1000

// Returns a Graph-usable access token for this user, refreshing it
// against Microsoft directly if the stored one is near expiry --
// Supabase itself never does this refresh for us (see auth/callback's
// capture comment). Returns null if the user has never connected
// Microsoft, connected before Files.Read was requested (needs to
// reconnect), or the stored refresh token has been revoked/expired.
export async function getValidGraphToken(userId: string): Promise<string | null> {
  const { data: row } = await supabaseAdmin
    .from('microsoft_graph_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row) return null
  if (!row.scope.includes('Files.Read')) return null

  const expiresAt = new Date(row.expires_at).getTime()
  if (expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return row.access_token
  }

  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('getValidGraphToken: AZURE_CLIENT_ID/AZURE_CLIENT_SECRET not configured')
    return null
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      scope: MICROSOFT_GRAPH_SCOPES,
    }),
  })

  if (!response.ok) {
    // Refresh token revoked/expired -- the user needs to reconnect.
    console.error('getValidGraphToken: refresh failed', await response.text())
    return null
  }

  const tokenData = await response.json()
  await supabaseAdmin
    .from('microsoft_graph_tokens')
    .update({
      access_token: tokenData.access_token,
      // Microsoft doesn't always issue a new refresh_token on refresh --
      // keep the existing one if it didn't.
      refresh_token: tokenData.refresh_token || row.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return tokenData.access_token
}
