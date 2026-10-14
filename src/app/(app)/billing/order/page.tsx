'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { MODULES } from '@/lib/billing/pricing'

type Status = 'verifying' | 'success' | 'failed'

type VerifyResult = {
  status: 'success' | 'failed'
  error?: string
  tier?: string
  seats?: number
  amount?: number
  currency?: string
  modules?: { key: string; pricePerUser: number }[]
}

const STEPS = ['Payment', 'Activation', 'Done'] as const

function moduleLabel(key: string) {
  return MODULES.find((m) => m.key === key)?.label || key
}

function OrderStatus() {
  const searchParams = useSearchParams()
  const reference = searchParams.get('reference') || searchParams.get('trxref')

  const [status, setStatus] = useState<Status>('verifying')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [revealedCount, setRevealedCount] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!reference) {
      setStatus('failed')
      setResult({ status: 'failed', error: 'No payment reference was returned by the payment gateway.' })
      return
    }

    let cancelled = false
    setStatus('verifying')

    fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((body: VerifyResult) => {
        if (cancelled) return
        setResult(body)
        setStatus(body.status)
      })
      .catch(() => {
        if (cancelled) return
        setResult({ status: 'failed', error: 'Could not reach the server to confirm your payment.' })
        setStatus('failed')
      })

    return () => {
      cancelled = true
    }
  }, [reference, attempt])

  // Purely a reveal pace for the module checklist below -- activation has
  // already completed server-side by the time `result` arrives.
  useEffect(() => {
    if (status !== 'success' || !result?.modules) return
    setRevealedCount(0)
    const total = result.modules.length
    const timers = Array.from({ length: total }, (_, i) =>
      setTimeout(() => setRevealedCount((n) => Math.max(n, i + 1)), 220 * i + 150)
    )
    return () => timers.forEach(clearTimeout)
  }, [status, result])

  const currentStepIndex = status === 'verifying' ? 1 : 2

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Your order</h1>
      <p className="text-gray-600 mb-6">
        {status === 'verifying' && 'Confirming your payment with Paystack...'}
        {status === 'success' && 'Your subscription is active.'}
        {status === 'failed' && 'There was a problem with this payment.'}
      </p>

      <nav className="flex items-center mb-8" aria-label="Checkout progress">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  i < currentStepIndex || (i === currentStepIndex && status === 'success')
                    ? 'bg-brand-blue text-white'
                    : i === currentStepIndex
                      ? 'bg-blue-100 text-brand-blue border-2 border-brand-blue'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i < currentStepIndex || (i === currentStepIndex && status === 'success') ? '✓' : i + 1}
              </div>
              <span
                className={`text-sm ${i === currentStepIndex ? 'font-medium text-gray-900' : 'text-gray-500'}`}
              >
                {step}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-3" />}
          </div>
        ))}
      </nav>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {status === 'verifying' && (
          <div className="flex items-center gap-3 text-gray-700">
            <span className="w-5 h-5 border-2 border-gray-300 border-t-brand-blue rounded-full animate-spin shrink-0" />
            <span className="text-sm">Order sent for processing...</span>
          </div>
        )}

        {status === 'success' && result && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
              <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs">
                &#10003;
              </span>
              Order confirmed &mdash; payment authorized
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">
                {revealedCount} of {result.modules?.length || 0} modules activated
              </p>
              <ul className="space-y-1.5">
                {result.modules?.map((mod, i) => (
                  <li
                    key={mod.key}
                    className={`flex items-center gap-2 text-sm transition-opacity duration-300 ${
                      i < revealedCount ? 'opacity-100' : 'opacity-30'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                        i < revealedCount ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {i < revealedCount ? '✓' : ''}
                    </span>
                    {moduleLabel(mod.key)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Plan</p>
                <p className="text-sm font-medium text-gray-900 capitalize">{result.tier}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Amount charged</p>
                <p className="text-sm font-medium text-gray-900">
                  {result.currency === 'NGN' ? '₦' : (result.currency || '') + ' '}
                  {Math.round(result.amount || 0).toLocaleString()}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard"
              className="inline-block bg-brand-blue text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-brand-blue-hover"
            >
              Go to dashboard
            </Link>
          </div>
        )}

        {status === 'failed' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
              <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs">!</span>
              Payment not confirmed
            </div>
            <p className="text-sm text-gray-600">{result.error}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="text-sm font-medium text-brand-blue hover:underline"
              >
                Check again
              </button>
              <Link href="/admin/billing/pricing" className="text-sm font-medium text-gray-500 hover:underline">
                Back to pricing
              </Link>
            </div>
          </div>
        )}
      </div>

      {status === 'verifying' && (
        <p className="text-xs text-gray-400 mt-4">
          Leaving this page won&apos;t cancel your order &mdash; we&apos;ll confirm the payment either way.
          If this doesn&apos;t update in a minute,{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="text-brand-blue hover:underline">
            refresh the status
          </button>
          .
        </p>
      )}
    </div>
  )
}

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<div className="p-8 max-w-xl mx-auto text-sm text-gray-500">Loading...</div>}>
      <OrderStatus />
    </Suspense>
  )
}
