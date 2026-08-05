// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  created_at: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [billingCurrency, setBillingCurrency] = useState('NGN')
  const [currencyOptions, setCurrencyOptions] = useState(['NGN'])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadClients = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setClients(data || [])
    setLoading(false)
  }

  const loadCurrencyOptions = async () => {
    const response = await fetch('/api/accounttrack/currency-settings')
    if (!response.ok) return
    const result = await response.json()
    const options = [result.base_currency, ...(result.enabled_currencies || [])]
    setCurrencyOptions(options)
    setBillingCurrency(result.base_currency)
  }

  useEffect(() => {
    loadClients()
    loadCurrencyOptions()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, phone, company, billing_currency: billingCurrency }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not create client')
      setSubmitting(false)
      return
    }

    setName('')
    setEmail('')
    setPhone('')
    setCompany('')
    setBillingCurrency(currencyOptions[0])
    setSubmitting(false)
    await loadClients()
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Clients</h1>
      <p className="text-gray-600 mb-6">Manage clients your organization works with.</p>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            required
            placeholder="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <input
            type="text"
            placeholder="Company (optional)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <input
            type="text"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <select
            value={billingCurrency}
            onChange={(e) => setBillingCurrency(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            {currencyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add client'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : clients.length === 0 ? (
        <p className="text-gray-500">No clients yet. Add your first one above.</p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-sm text-gray-500">
                  {[c.company, c.email, c.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <a href={`/admin/clients/${c.id}`} className="text-xs text-blue-600 hover:underline">
                View matters →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}