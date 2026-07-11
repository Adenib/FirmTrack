'use client'

import { useState } from 'react'

type Props = {
  module: string
  onClose: () => void
}

const TIER_PRICES: Record<string, number> = {
  basic: 1500,
  standard: 2500,
  elite: 4000,
}

const TIER_FEATURES: Record<string, string[]> = {
  basic: ['Full module access', 'Up to 20 users', 'Email support'],
  standard: ['Full module access', 'Up to 50 users', 'Priority support', 'Data export'],
  elite: ['Full module access', 'Unlimited users', 'API access', 'Dedicated support', 'Custom reports'],
}

export default function UpgradeModal({ module, onClose }: Props) {
  const [selectedTier, setSelectedTier] = useState('basic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUpgrade = async () => {
    setLoading(true)
    setError('')

    const response = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ module, tier: selectedTier, currency: 'NGN' }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to initialize payment')
      setLoading(false)
      return
    }

    // Redirect to Paystack checkout
    window.location.href = result.authorization_url
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 capitalize">
                Unlock {module}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Choose a plan to activate this module
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl font-light"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-3 mb-6">
            {Object.entries(TIER_PRICES).map(([tier, price]) => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={`border rounded-lg p-3 text-left transition ${
                  selectedTier === tier
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold capitalize text-gray-900">{tier}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  ₦{price.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">/user/month</p>
              </button>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)} includes:
            </p>
            <ul className="space-y-1">
              {TIER_FEATURES[selectedTier].map((feature) => (
                <li key={feature} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="text-green-500">✓</span> {feature}
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Redirecting to payment...' : `Pay with Paystack`}
          </button>

          <p className="text-xs text-gray-400 text-center mt-3">
            Secured by Paystack. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  )
}