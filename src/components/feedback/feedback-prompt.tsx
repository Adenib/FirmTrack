'use client'

import { useEffect, useState } from 'react'
import { StarIcon } from '@/components/brand/icons'

// Mounted once in the authenticated app layout. Checks once per mount
// whether this user is due for a feedback prompt (server-side cadence --
// see src/lib/feedback/cadence.ts) and renders the modal if so. The check
// itself already advances the user's schedule, so no further state needs
// tracking here for "Remind me later" -- closing the modal without
// submitting is enough.
export default function FeedbackPrompt() {
  const [visible, setVisible] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/app-feedback/status')
      .then((r) => r.json())
      .then((result) => {
        if (result.shouldShow) setVisible(true)
      })
      .catch(() => {})
  }, [])

  if (!visible) return null

  const handleSubmit = async () => {
    if (rating < 1) return
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/app-feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const result = await res.json()
      setError(result.error || 'Could not submit feedback')
      return
    }
    setSubmitted(true)
    setTimeout(() => setVisible(false), 1800)
  }

  const handleOptOut = async () => {
    setVisible(false)
    await fetch('/api/app-feedback/opt-out', { method: 'POST' }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        {submitted ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-2">🙏</p>
            <p className="font-semibold text-gray-900">Thanks for the feedback!</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">How's FirmTrack working for you?</h2>
            <p className="text-sm text-gray-500 mb-4">Your rating helps us know what to fix next.</p>

            <div className="flex items-center justify-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  className="p-1"
                >
                  <StarIcon
                    className={`w-8 h-8 ${
                      n <= (hoverRating || rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything you'd like us to know? (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4"
            />

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting || rating < 1}
              className="w-full bg-brand-blue text-white py-2.5 rounded-md font-medium hover:bg-brand-blue-hover disabled:opacity-50 mb-2"
            >
              {submitting ? 'Submitting...' : 'Submit feedback'}
            </button>

            <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
              <button onClick={() => setVisible(false)} className="hover:text-gray-600">
                Remind me later
              </button>
              <span>&middot;</span>
              <button onClick={handleOptOut} className="hover:text-gray-600">
                Don&apos;t ask again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
