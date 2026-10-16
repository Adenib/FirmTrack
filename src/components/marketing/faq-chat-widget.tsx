'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FAQ_CATEGORIES, matchFaqEntry, type FaqEntry, type FaqCategory } from '@/lib/marketing/faq'

const LEAD_STORAGE_KEY = 'firmtrack_sales_lead'
const POLL_INTERVAL_MS = 3000
const TYPING_PING_THROTTLE_MS = 2000

type SalesMessage = { id: string; sender_type: 'lead' | 'agent'; body: string; created_at: string }
type LeadSession = { id: string; token: string }

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
  const [category, setCategory] = useState<FaqCategory | null>(null)
  const [selected, setSelected] = useState<FaqEntry | null>(null)
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState<{ query: string; result: FaqEntry | null } | null>(null)

  // 'faq' is the existing topic-browsing flow above; 'sales-form' is the
  // pre-chat contact form a prospect fills in once, before 'sales-chat'
  // (a live thread with a human) opens. There's no FirmTrack login here
  // -- a prospect isn't a subscriber yet -- so leadSession's token is
  // what proves ownership of the thread on every later request, stored
  // in localStorage so reloading the page (or coming back later) doesn't
  // lose it.
  const [view, setView] = useState<'faq' | 'sales-form' | 'sales-chat'>('faq')
  const [leadSession, setLeadSession] = useState<LeadSession | null>(null)
  const [leadStatus, setLeadStatus] = useState<string>('open')

  const [leadName, setLeadName] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [leadMessage, setLeadMessage] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [salesMessages, setSalesMessages] = useState<SalesMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const [agentTyping, setAgentTyping] = useState(false)
  const lastTypingPingRef = useRef(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEAD_STORAGE_KEY)
      if (raw) {
        const session: LeadSession = JSON.parse(raw)
        if (session?.id && session?.token) {
          setLeadSession(session)
          setView('sales-chat')
        }
      }
    } catch {
      // Private browsing / blocked storage -- just start a fresh form each time.
    }
  }, [])

  useEffect(() => {
    if (view !== 'sales-chat' || !leadSession) return
    const poll = async () => {
      const res = await fetch(`/api/sales-chat/leads/${leadSession.id}/messages?token=${encodeURIComponent(leadSession.token)}`)
      const result = await res.json()
      if (res.ok) {
        setSalesMessages(result.messages || [])
        setAgentTyping(!!result.agentTyping)
        setLeadStatus(result.status || 'open')
      }
    }
    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [view, leadSession])

  const pingTyping = () => {
    if (!leadSession) return
    const now = Date.now()
    if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return
    lastTypingPingRef.current = now
    fetch(`/api/sales-chat/leads/${leadSession.id}/typing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: leadSession.token }),
    }).catch(() => {})
  }

  const submitSalesForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSubmitting(true)
    setFormError('')

    const res = await fetch('/api/sales-chat/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: leadName, email: leadEmail, phone: leadPhone, message: leadMessage }),
    })
    const result = await res.json()
    if (!res.ok) {
      setFormError(result.error || 'Could not start the chat')
      setFormSubmitting(false)
      return
    }

    const session: LeadSession = { id: result.lead.id, token: result.lead.access_token }
    try {
      localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(session))
    } catch {
      // Ignore -- the session still works for this page view, it just
      // won't survive a reload.
    }
    setLeadSession(session)
    setSalesMessages([{ id: 'initial', sender_type: 'lead', body: leadMessage, created_at: new Date().toISOString() }])
    setView('sales-chat')
    setFormSubmitting(false)
  }

  const sendSalesMessage = async () => {
    if (!chatInput.trim() || !leadSession) return
    setChatSending(true)
    setChatError('')
    const body = chatInput
    setChatInput('')
    setSalesMessages((prev) => [...prev, { id: 'optimistic-' + Date.now(), sender_type: 'lead', body, created_at: new Date().toISOString() }])

    const res = await fetch(`/api/sales-chat/leads/${leadSession.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: leadSession.token, body }),
    })
    const result = await res.json()
    if (!res.ok) setChatError(result.error || 'Message failed to send')
    setChatSending(false)
  }

  const startNewChat = () => {
    try {
      localStorage.removeItem(LEAD_STORAGE_KEY)
    } catch {
      // Nothing to clean up if storage was never available.
    }
    setLeadSession(null)
    setSalesMessages([])
    setLeadName('')
    setLeadEmail('')
    setLeadPhone('')
    setLeadMessage('')
    setView('sales-form')
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearched({ query, result: matchFaqEntry(query) })
    setSelected(null)
    setCategory(null)
    setQuery('')
  }

  const resetToCategories = () => {
    setSelected(null)
    setCategory(null)
    setSearched(null)
  }

  const backToCategory = () => {
    setSelected(null)
    setSearched(null)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-[340px] max-w-[calc(100vw-2.5rem)] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[70vh]">
          <div className="bg-brand-gradient text-white px-4 py-3 flex items-center justify-between">
            <p className="font-semibold text-sm">
              {view === 'faq' ? 'Ask about FirmTrack' : 'Chat with Sales'}
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="text-white/80 hover:text-white">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {view === 'sales-form' && (
            <div className="flex-1 overflow-y-auto p-4">
              <button type="button" onClick={() => setView('faq')} className="text-xs text-brand-blue hover:underline mb-3">
                &larr; Back
              </button>
              <p className="text-sm text-gray-600 mb-3">
                Tell us a bit about yourself and we'll connect you with sales.
              </p>
              <form onSubmit={submitSalesForm} className="space-y-2">
                <input
                  type="text"
                  required
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
                <input
                  type="email"
                  required
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
                <input
                  type="tel"
                  required
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
                <textarea
                  required
                  rows={3}
                  value={leadMessage}
                  onChange={(e) => setLeadMessage(e.target.value)}
                  placeholder="How can we help you today?"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
                {formError && <p className="text-xs text-red-600">{formError}</p>}
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="w-full text-sm bg-brand-blue text-white py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
                >
                  {formSubmitting ? 'Starting chat...' : 'Start chat'}
                </button>
              </form>
            </div>
          )}

          {view === 'sales-chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {salesMessages.map((m) => (
                    <div key={m.id} className={`text-sm p-2 rounded-md ${m.sender_type === 'lead' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400">{m.sender_type === 'lead' ? 'You' : 'Sales'}</p>
                      <p>{m.body}</p>
                    </div>
                  ))}
                </div>
                {agentTyping && <p className="text-xs text-gray-400 italic mt-2">Sales is typing...</p>}
              </div>
              {leadStatus === 'closed' ? (
                <div className="border-t border-gray-200 p-3 text-center">
                  <p className="text-xs text-gray-500 mb-2">This conversation has ended.</p>
                  <button type="button" onClick={startNewChat} className="text-xs font-medium text-brand-blue hover:underline">
                    Start a new chat
                  </button>
                </div>
              ) : (
                <>
                  {chatError && <p className="text-xs text-amber-600 px-3">{chatError}</p>}
                  <form
                    onSubmit={(e) => { e.preventDefault(); sendSalesMessage() }}
                    className="border-t border-gray-200 p-2 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => { setChatInput(e.target.value); if (e.target.value) pingTyping() }}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-blue"
                    />
                    <button
                      type="submit"
                      disabled={chatSending}
                      className="text-sm bg-brand-blue text-white px-3 py-2 rounded-md hover:bg-brand-blue-hover disabled:opacity-50"
                    >
                      Send
                    </button>
                  </form>
                </>
              )}
            </>
          )}

          {view === 'faq' && (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                {selected ? (
                  // Level 3: a specific answer.
                  <div>
                    <button type="button" onClick={backToCategory} className="text-xs text-brand-blue hover:underline mb-3">
                      &larr; {category ? `Back to ${category.label}` : 'Ask something else'}
                    </button>
                    <p className="text-sm font-semibold text-gray-900 mb-1">{selected.question}</p>
                    <p className="text-sm text-gray-700">{selected.answer}</p>
                  </div>
                ) : searched ? (
                  // Free-text search result.
                  <div>
                    <button type="button" onClick={resetToCategories} className="text-xs text-brand-blue hover:underline mb-3">
                      &larr; Ask something else
                    </button>
                    {searched.result ? (
                      <>
                        <p className="text-sm font-semibold text-gray-900 mb-1">{searched.result.question}</p>
                        <p className="text-sm text-gray-700">{searched.result.answer}</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-700">
                        I don&apos;t have an answer for that yet — the fastest way to get one is to chat with sales below.
                      </p>
                    )}
                  </div>
                ) : category ? (
                  // Level 2: questions within a category.
                  <div>
                    <button type="button" onClick={resetToCategories} className="text-xs text-brand-blue hover:underline mb-3">
                      &larr; All topics
                    </button>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">{category.label}</p>
                    <div className="space-y-1.5">
                      {category.entries.map((entry) => (
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
                ) : (
                  // Level 1: topic categories.
                  <div>
                    <p className="text-sm text-gray-600 mb-3">
                      Hi! I can answer common questions about FirmTrack. Pick a topic below, or type your own question.
                    </p>
                    <button
                      type="button"
                      onClick={() => setView(leadSession ? 'sales-chat' : 'sales-form')}
                      className="w-full text-left text-sm px-3 py-2.5 mb-3 rounded-md text-white bg-brand-blue hover:bg-brand-blue-hover flex items-center justify-between"
                    >
                      <span>Chat with Sales</span>
                      <span aria-hidden>&rarr;</span>
                    </button>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FAQ_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategory(cat)}
                          className="text-left text-sm px-3 py-2 border border-gray-200 rounded-md text-gray-700 hover:border-brand-blue/40 hover:bg-blue-50"
                        >
                          {cat.label}
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
            </>
          )}
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
