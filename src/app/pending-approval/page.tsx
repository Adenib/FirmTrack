'use client'

import AuthCard from '@/components/auth/auth-card'

export default function PendingApprovalPage() {
  return (
    <AuthCard tagline>
      <h1 className="text-2xl font-bold mb-4 text-center">Almost there</h1>
      <p className="text-gray-700 text-center mb-6">
        Your firm&apos;s account is awaiting approval from our team. We&apos;ll email you as soon as it&apos;s ready
        -- this usually doesn&apos;t take long.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-full bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover mb-3"
      >
        Check again
      </button>
      <p className="text-sm text-center">
        <a href="/auth/signout" className="text-brand-blue hover:underline">
          Sign out
        </a>
      </p>
    </AuthCard>
  )
}
