'use client'

import { useEffect, useState } from 'react'
import { StarIcon } from '@/components/brand/icons'

type FeedbackEntry = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  org_name: string
  user_email: string
}

type Stats = {
  total: number
  average: number
  distribution: number[]
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} className={`w-4 h-4 ${n <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
      ))}
    </div>
  )
}

export default function FeedbackClient() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, average: 0, distribution: [0, 0, 0, 0, 0] })
  const [loading, setLoading] = useState(true)
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/creator/feedback')
      .then((r) => r.json())
      .then((result) => {
        setFeedback(result.feedback || [])
        setStats(result.stats || { total: 0, average: 0, distribution: [0, 0, 0, 0, 0] })
        setLoading(false)
      })
  }, [])

  const visible = ratingFilter ? feedback.filter((f) => f.rating === ratingFilter) : feedback
  const maxCount = Math.max(1, ...stats.distribution)

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Feedback</h1>
      <p className="text-gray-500 text-sm mb-6">Ratings and comments submitted from inside the app.</p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-xs text-gray-500 mb-1">Average rating</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold text-gray-900">{stats.average.toFixed(2)}</p>
                <Stars rating={Math.round(stats.average)} />
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-xs text-gray-500 mb-1">Total responses</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <p className="text-sm font-semibold text-gray-900 mb-3">Rating distribution</p>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = stats.distribution[n - 1]
                return (
                  <button
                    key={n}
                    onClick={() => setRatingFilter(ratingFilter === n ? null : n)}
                    className={`w-full flex items-center gap-2 text-left p-1 rounded ${ratingFilter === n ? 'bg-blue-50' : ''}`}
                  >
                    <span className="text-xs text-gray-500 w-10">{n} star</span>
                    <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                      <div
                        className="bg-yellow-400 h-3"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                  </button>
                )
              })}
            </div>
            {ratingFilter && (
              <button onClick={() => setRatingFilter(null)} className="text-xs text-blue-600 hover:underline mt-3">
                Clear filter
              </button>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm font-semibold text-gray-900 mb-3">
              Responses {ratingFilter ? `(${ratingFilter} star)` : ''}
            </p>
            {visible.length === 0 ? (
              <p className="text-sm text-gray-500">No feedback yet.</p>
            ) : (
              <div className="space-y-4">
                {visible.map((f) => (
                  <div key={f.id} className="py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <Stars rating={f.rating} />
                      <span className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">{f.org_name} &middot; {f.user_email}</p>
                    {f.comment && <p className="text-sm text-gray-700">{f.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
