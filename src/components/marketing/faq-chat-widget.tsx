'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FAQ_ENTRIES, matchFaqEntry, type FaqEntry } from '@/lib/marketing/faq'

function ChatIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path
        d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.1 0-2.1-.2-3-.6L4 20l1.1-4.4C4.4 14.4 4 13.3 4 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function XIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}

export default function FaqChatWidget() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<FaqEntry | null>(null)
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState<{ query: string; result: FaqEntry | null } | null>(null)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearched({ query, result: matchFaqEntry(query) })
    setSelected(null)
    setQuery('')
  }

  const reset = () => {
    setSelected(null)
    setSearched(null)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-[340px] max-w-[calc(100vw-2.5rem)] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[70vh]">
          <div className="bg-brand-gradient text-white px-4 py-3 flex items-center justify-between">
            <p className="font-semibold text-sm">Ask about FirmTrack</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="text-white/80 hover:text-white">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <div>
                <button type="button" onClick={reset} className="text-xs text-brand-blue hover:underline mb-3">
                  &larr; Ask something else
                </button>
                <p className="text-sm font-semibold text-gray-900 mb-1">{selected.question}</p>
                <p className="text-sm text-gray-700">{selected.answer}</p>
              </div>
            ) : searched ? (
              <div>
                <button type="button" onClick={reset} className="text-xs text-brand-blue hover:underline mb-3">
                  &larr; Ask something else
                </button>
                {searched.result ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900 mb-1">{searched.result.question}</p>
                    <p className="text-sm text-gray-700">{searched.result.answer}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-700">
                    I don&apos;t have an answer for that yet — the fastest way to get one is to book a demo below.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Hi! I can answer common questions about FirmTrack. Pick one below, or type your own.
                </p>
                <div className="space-y-1.5">
                  {FAQ_ENTRIES.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelected(entry)}
                      className="block w-full text-left text-sm px-3 py-2 border border-gray-200 rounded-md text-gray-700 hover:border-brand-blue/40 hover:bg-blue-50"
                    >
                      {entry.question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSearch} className="border-t border-gray-200 p-2 flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a question..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
            <button
              type="submit"
              className="text-sm bg-brand-blue text-white px-3 py-2 rounded-md hover:bg-brand-blue-hover"
            >
              Ask
            </button>
          </form>

          <div className="border-t border-gray-200 p-2 flex items-center justify-center gap-2 bg-gray-50">
            <a
              href="mailto:demo@firmtracks.com?subject=Book%20a%20FirmTrack%20demo"
              className="text-xs font-medium text-gray-700 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-white"
            >
              Book a demo
            </a>
            <Link
              href="/register"
              className="text-xs font-medium text-white bg-brand-blue rounded-md px-3 py-1.5 hover:bg-brand-blue-hover"
            >
              Get started free
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="w-14 h-14 rounded-full bg-brand-blue text-white shadow-lg flex items-center justify-center hover:bg-brand-blue-hover"
      >
        {open ? <XIcon className="w-6 h-6" /> : <ChatIcon className="w-6 h-6" />}
      </button>
    </div>
  )
}
