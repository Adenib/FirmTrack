'use client'

import { useEffect, useState } from 'react'
import { ADDON_PRICE_BASIC } from '@/lib/billing/pricing'

type Props = {
  aiSupportActive: boolean
  onClose: () => void
}

type SupportRequest = {
  id: string
  subject: string
  description: string
  channel: 'standard' | 'ai_assisted'
  severity: 'A' | 'B' | 'C'
  status: 'open' | 'agent_assigned' | 'resolved'
  created_at: string
}

type SupportMessage = {
  id: string
  sender_type: 'user' | 'ai' | 'agent'
  body: string
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  agent_assigned: 'Agent assigned',
  resolved: 'Issue resolved',
}

export default function SupportModal({ aiSupportActive, onClose }: Props) {
  const [tab, setTab] = useState<'new' | 'history'>('new')

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'A' | 'B' | 'C'>('C')
  const [channel, setChannel] = useState<'standard' | 'ai_assisted'>('standard')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<SupportRequest | null>(null)

  const [subscribing, setSubscribing] = useState(false)

  const [history, setHistory] = useState<SupportRequest[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [openRequest, setOpenRequest] = useState<SupportRequest | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const loadHistory = async () => {
    setLoadingHistory(true)
    const res = await fetch('/api/support/requests')
    const result = await res.json()
    if (res.ok) setHistory(result.requests || [])
    setLoadingHistory(false)
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  const handleSubscribeAiSupport = async () => {
    setSubscribing(true)
    const res = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modules: ['ai_support'], tier: 'basic', currency: 'NGN' }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Failed to start subscription')
      setSubscribing(false)
      return
    }
    window.location.href = result.authorization_url
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/support/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject, description, channel, severity }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not submit request')
      setSubmitting(false)
      return
    }
    setCreated(result.request)
    setSubmitting(false)
  }

  const openThread = async (req: SupportRequest) => {
    setOpenRequest(req)
    const res = await fetch(`/api/support/requests/${req.id}/messages`)
    const result = await res.json()
    if (res.ok) setMessages(result.messages || [])
  }

  const sendChatMessage = async (requestId: string) => {
    if (!chatInput.trim()) return
    setChatSending(true)
    setChatError('')
    const optimistic: SupportMessage = {
      id: 'optimistic-' + Date.now(),
      sender_type: 'user',
      body: chatInput,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    const body = chatInput
    setChatInput('')

    const res = await fetch(`/api/support/requests/${requestId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const result = await res.json()
    if (!res.ok) {
      setChatError(result.error || 'Message failed to send')
    } else {
      setMessages((prev) => [...prev, result.message])
    }
    setChatSending(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTab('new')}
              className={`text-sm font-semibold pb-1 border-b-2 ${tab === 'new' ? 'border-blue-600 text-gray-900' : 'border-transparent text-gray-400'}`}
            >
              Support Assistant
            </button>
            <button
              onClick={() => setTab('history')}
              className={`text-sm font-semibold pb-1 border-b-2 ${tab === 'history' ? 'border-blue-600 text-gray-900' : 'border-transparent text-gray-400'}`}
            >
              Support History
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'new' && !created && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Description</label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as 'A' | 'B' | 'C')}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="A">Sev A — critical, blocking work</option>
                  <option value="B">Sev B — significant issue</option>
                  <option value="C">Sev C — general question</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2 border rounded-md p-3 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                  <input
                    type="radio"
                    checked={channel === 'standard'}
                    onChange={() => setChannel('standard')}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Standard (free)</span>
                    <span className="block text-xs text-gray-500">A human replies via support@firmtracks.com within 24 hours.</span>
                  </span>
                </label>

                <label className={`flex items-start gap-2 border rounded-md p-3 ${aiSupportActive ? 'cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50' : 'opacity-60'}`}>
                  <input
                    type="radio"
                    checked={channel === 'ai_assisted'}
                    onChange={() => setChannel('ai_assisted')}
                    disabled={!aiSupportActive}
                    className="mt-1"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-gray-900">AI Assistant (instant)</span>
                    <span className="block text-xs text-gray-500">
                      {aiSupportActive
                        ? 'Chat instantly with the AI Support Assistant.'
                        : `Requires the AI Support Assistant add-on (from ₦${ADDON_PRICE_BASIC.toLocaleString()}/user/month).`}
                    </span>
                    {!aiSupportActive && (
                      <button
                        type="button"
                        onClick={handleSubscribeAiSupport}
                        disabled={subscribing}
                        className="mt-2 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 disabled:opacity-50"
                      >
                        {subscribing ? 'Redirecting...' : 'Subscribe'}
                      </button>
                    )}
                  </span>
                </label>
              </div>

              {error && <p className="text-red-600 text-xs">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit request'}
              </button>
            </form>
          )}

          {tab === 'new' && created && created.channel === 'standard' && (
            <div className="text-sm text-gray-700">
              <p className="font-medium text-gray-900 mb-1">Request submitted.</p>
              <p>We&apos;ll respond via support@firmtracks.com within 24 hours.</p>
            </div>
          )}

          {tab === 'new' && created && created.channel === 'ai_assisted' && (
            <AiChatThread requestId={created.id} />
          )}

          {tab === 'history' && !openRequest && (
            <div className="space-y-3">
              {loadingHistory ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-500">No requests yet.</p>
              ) : (
                history.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => openThread(req)}
                    className="w-full text-left border border-gray-200 rounded-md p-3 hover:bg-gray-50"
                  >
                    <p className="text-sm font-medium text-gray-900">{req.subject}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Sev {req.severity} · {STATUS_LABEL[req.status]} · {new Date(req.created_at).toLocaleString()}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === 'history' && openRequest && (
            <div>
              <button onClick={() => setOpenRequest(null)} className="text-xs text-blue-600 hover:underline mb-3">
                ← Back to history
              </button>
              <p className="text-sm font-medium text-gray-900 mb-1">{openRequest.subject}</p>
              <p className="text-xs text-gray-500 mb-3">
                Sev {openRequest.severity} · {STATUS_LABEL[openRequest.status]}
              </p>
              <div className="space-y-2 mb-3">
                {messages.map((m) => (
                  <div key={m.id} className={`text-sm p-2 rounded-md ${m.sender_type === 'user' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-400 capitalize">{m.sender_type}</p>
                    <p>{m.body}</p>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-sm text-gray-500">{openRequest.description}</p>}
              </div>
              {openRequest.channel === 'ai_assisted' && (
                <AiChatThread requestId={openRequest.id} initialMessages={messages} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AiChatThread({ requestId, initialMessages }: { requestId: string; initialMessages?: SupportMessage[] }) {
  const [messages, setMessages] = useState<SupportMessage[]>(initialMessages || [])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    if (!input.trim()) return
    setSending(true)
    setError('')
    const body = input
    setInput('')
    setMessages((prev) => [...prev, { id: 'optimistic-' + Date.now(), sender_type: 'user', body, created_at: new Date().toISOString() }])

    const res = await fetch(`/api/support/requests/${requestId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Message failed to send')
    } else {
      setMessages((prev) => [...prev, result.message])
    }
    setSending(false)
  }

  return (
    <div>
      <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className={`text-sm p-2 rounded-md ${m.sender_type === 'user' ? 'bg-blue-50' : 'bg-purple-50'}`}>
            <p className="text-xs text-gray-400 capitalize">{m.sender_type === 'ai' ? 'AI Assistant' : m.sender_type}</p>
            <p>{m.body}</p>
          </div>
        ))}
      </div>
      {error && <p className="text-amber-600 text-xs mb-2">{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 border rounded-md text-sm"
        />
        <button
          onClick={send}
          disabled={sending}
          className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
