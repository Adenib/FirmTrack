'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserIdentity } from '@supabase/supabase-js'
import { oauthScopesFor } from '@/lib/microsoft-graph/scopes'

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email and password',
  google: 'Google',
  azure: 'Microsoft',
}

export default function AccountPage() {
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [hasFileAccess, setHasFileAccess] = useState(false)
  const [hasMailAccess, setHasMailAccess] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: identitiesError } = await supabase.auth.getUserIdentities()
    if (identitiesError) setError(identitiesError.message)
    else setIdentities(data?.identities || [])

    const statusRes = await fetch('/api/doctrack/microsoft/status')
    if (statusRes.ok) {
      const status = await statusRes.json()
      setHasFileAccess(status.hasFileAccess)
      setHasMailAccess(status.hasMailAccess)
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleConnect = async (provider: 'google' | 'azure') => {
    setError('')
    setPending(provider)
    const supabase = createClient()
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/account`,
        scopes: oauthScopesFor(provider),
      },
    })
    if (linkError) {
      setError(linkError.message)
      setPending(null)
    }
    // On success the browser navigates away to the provider's consent screen.
  }

  const handleDisconnect = async (identity: UserIdentity) => {
    setError('')
    setPending(identity.provider)
    const supabase = createClient()
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity)
    if (unlinkError) setError(unlinkError.message)
    setPending(null)
    await load()
  }

  const linkedProviders = new Set(identities.map((i) => i.provider))
  const connectableProviders = (['google', 'azure'] as const).filter((p) => !linkedProviders.has(p))

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Account</h1>
      <p className="text-gray-600 mb-6">Manage how you sign in to FirmTrack.</p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-900">Connected sign-in methods</p>

          {identities.map((identity) => (
            <div key={identity.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
              <div>
                <span className="text-sm text-gray-700">{PROVIDER_LABELS[identity.provider] || identity.provider}</span>
                {identity.provider === 'azure' && !hasFileAccess && (
                  <p className="text-xs text-amber-600 mt-0.5">File linking (DocTrack) not enabled for this connection</p>
                )}
                {identity.provider === 'azure' && hasFileAccess && !hasMailAccess && (
                  <p className="text-xs text-amber-600 mt-0.5">Email linking (DocTrack) not enabled for this connection</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {identity.provider === 'azure' && (!hasFileAccess || !hasMailAccess) && (
                  <button
                    type="button"
                    disabled={pending === 'azure'}
                    onClick={() => handleConnect('azure')}
                    className="text-xs text-brand-blue hover:underline disabled:opacity-50"
                  >
                    {pending === 'azure' ? 'Redirecting...' : 'Reconnect'}
                  </button>
                )}
                {identity.provider !== 'email' && (
                  <button
                    type="button"
                    disabled={pending === identity.provider || identities.length < 2}
                    onClick={() => handleDisconnect(identity)}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:no-underline"
                    title={identities.length < 2 ? "Can't disconnect your only sign-in method" : undefined}
                  >
                    {pending === identity.provider ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {connectableProviders.length > 0 && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-sm font-medium text-gray-900 mb-1">Connect another method</p>
              {connectableProviders.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  disabled={pending === provider}
                  onClick={() => handleConnect(provider)}
                  className="w-full text-left border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {pending === provider ? 'Redirecting...' : `Connect ${PROVIDER_LABELS[provider]}`}
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>
      )}
    </div>
  )
}
