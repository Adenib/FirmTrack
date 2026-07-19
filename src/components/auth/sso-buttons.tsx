'use client'

import { useState } from 'react'

type Provider = 'google' | 'azure'

export default function SsoButtons({
  onSelect,
  label = 'Continue with',
}: {
  onSelect: (provider: Provider) => Promise<{ error: { message: string } | null }>
  label?: string
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Provider | null>(null)

  const handleClick = async (provider: Provider) => {
    setError('')
    setPending(provider)
    const { error: selectError } = await onSelect(provider)
    if (selectError) {
      setError(selectError.message)
      setPending(null)
    }
    // On success the browser is about to navigate away to the provider's
    // consent screen -- no need to clear `pending`.
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => handleClick('google')}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending === 'google' ? 'Redirecting...' : `${label} Google`}
      </button>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => handleClick('azure')}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending === 'azure' ? 'Redirecting...' : `${label} Microsoft`}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}
