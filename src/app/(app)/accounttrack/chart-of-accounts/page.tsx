// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense']

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('expense')
  const [currency, setCurrency] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('NGN')
  const [currencyOptions, setCurrencyOptions] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const loadAccounts = async () => {
    setLoading(true)
    const response = await fetch('/api/accounttrack/chart-of-accounts')
    const result = await response.json()
    if (response.ok) setAccounts(result.accounts || [])
    else setError(result.error || 'Could not load chart of accounts')
    setLoading(false)
  }

  const loadCurrencyOptions = async () => {
    const response = await fetch('/api/accounttrack/currency-settings')
    if (!response.ok) return
    const result = await response.json()
    setBaseCurrency(result.base_currency)
    setCurrencyOptions(result.enabled_currencies || [])
  }

  useEffect(() => {
    loadAccounts()
    loadCurrencyOptions()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/accounttrack/chart-of-accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code || null, name, account_type: accountType, currency: currency || null }),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not create account')
      setSubmitting(false)
      return
    }

    setCode('')
    setName('')
    setAccountType('expense')
    setCurrency('')
    setSubmitting(false)
    await loadAccounts()
  }

  const handleDelete = async (id) => {
    setError('')
    const response = await fetch(`/api/accounttrack/chart-of-accounts?id=${id}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not delete account')
      return
    }
    await loadAccounts()
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">
          ← AccountTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        The 8 default accounts (marked &quot;Default&quot;) back automatic postings and can&apos;t be deleted.
        Add custom accounts below for anything else (rent, salaries, bank fees, etc.).
      </p>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Code (optional)</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-24 px-2 py-1 border rounded text-sm"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="px-2 py-1 border rounded text-sm capitalize"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">{baseCurrency} (default)</option>
            {currencyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Add account
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Currency</th>
                <th className="px-3 py-2 font-medium"></th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-700">{a.code || '—'}</td>
                  <td className="px-3 py-2 text-gray-900 font-medium">{a.name}</td>
                  <td className="px-3 py-2 text-gray-700 capitalize">{a.account_type}</td>
                  <td className="px-3 py-2 text-gray-700">{a.currency || baseCurrency}</td>
                  <td className="px-3 py-2">
                    {a.key && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Default</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!a.key && (
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
