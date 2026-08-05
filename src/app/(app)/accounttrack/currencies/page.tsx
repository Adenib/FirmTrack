// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function CurrenciesPage() {
  const [baseCurrency, setBaseCurrency] = useState('NGN')
  const [baseCurrencyLocked, setBaseCurrencyLocked] = useState(false)
  const [baseCurrencyInput, setBaseCurrencyInput] = useState('NGN')
  const [savingBaseCurrency, setSavingBaseCurrency] = useState(false)
  const [enabledCurrencies, setEnabledCurrencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newCurrency, setNewCurrency] = useState('')
  const [enabling, setEnabling] = useState(false)

  const [rates, setRates] = useState([])
  const [ratesLoading, setRatesLoading] = useState(true)
  const [rateFrom, setRateFrom] = useState('')
  const [rateTo, setRateTo] = useState('')
  const [rateValue, setRateValue] = useState('')
  const [rateDate, setRateDate] = useState(new Date().toISOString().split('T')[0])
  const [addingRate, setAddingRate] = useState(false)

  const loadSettings = async () => {
    setLoading(true)
    const response = await fetch('/api/accounttrack/currency-settings')
    const result = await response.json()
    if (response.ok) {
      setBaseCurrency(result.base_currency)
      setBaseCurrencyInput(result.base_currency)
      setBaseCurrencyLocked(result.base_currency_locked)
      setEnabledCurrencies(result.enabled_currencies || [])
    } else {
      setError(result.error || 'Could not load currency settings')
    }
    setLoading(false)
  }

  const loadRates = async () => {
    setRatesLoading(true)
    const response = await fetch('/api/accounttrack/exchange-rates')
    const result = await response.json()
    if (response.ok) setRates(result.rates || [])
    setRatesLoading(false)
  }

  useEffect(() => {
    loadSettings()
    loadRates()
  }, [])

  const handleEnable = async (e) => {
    e.preventDefault()
    setEnabling(true)
    setError('')
    const response = await fetch('/api/accounttrack/currency-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currency: newCurrency.toUpperCase() }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not enable currency')
      setEnabling(false)
      return
    }
    setNewCurrency('')
    setEnabling(false)
    await loadSettings()
  }

  const handleDisable = async (currency) => {
    setError('')
    const response = await fetch(`/api/accounttrack/currency-settings?currency=${currency}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not remove currency')
      return
    }
    await loadSettings()
  }

  const handleAddRate = async (e) => {
    e.preventDefault()
    setAddingRate(true)
    setError('')
    const response = await fetch('/api/accounttrack/exchange-rates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from_currency: rateFrom.toUpperCase(),
        to_currency: rateTo.toUpperCase(),
        rate: Number(rateValue),
        effective_date: rateDate,
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not add exchange rate')
      setAddingRate(false)
      return
    }
    setRateFrom('')
    setRateTo('')
    setRateValue('')
    setAddingRate(false)
    await loadRates()
  }

  const allCurrencies = [baseCurrency, ...enabledCurrencies]

  const handleSaveBaseCurrency = async (e) => {
    e.preventDefault()
    setSavingBaseCurrency(true)
    setError('')
    const response = await fetch('/api/accounttrack/currency-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base_currency: baseCurrencyInput.toUpperCase() }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not update base currency')
      setSavingBaseCurrency(false)
      return
    }
    setSavingBaseCurrency(false)
    await loadSettings()
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Currencies</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">
          ← AccountTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Your firm&apos;s base currency, which foreign currencies clients/matters/accounts can use, and
        manually-entered exchange rates.
      </p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-gray-900 mb-1">Base currency</h2>
            <p className="text-sm text-gray-600 mb-3">
              Your firm&apos;s reporting currency. Financial statements are always in this currency.
              Editable until your first posted transaction, then locked.
            </p>
            {baseCurrencyLocked ? (
              <p className="text-lg font-semibold text-gray-900">{baseCurrency} <span className="text-xs font-normal text-gray-500">(locked — transactions posted)</span></p>
            ) : (
              <form onSubmit={handleSaveBaseCurrency} className="flex items-end gap-2">
                <input
                  type="text"
                  required
                  maxLength={3}
                  value={baseCurrencyInput}
                  onChange={(e) => setBaseCurrencyInput(e.target.value)}
                  className="w-24 px-2 py-1 border rounded text-sm uppercase"
                />
                <button
                  type="submit"
                  disabled={savingBaseCurrency}
                  className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
              </form>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Enabled foreign currencies</h2>
            <form onSubmit={handleEnable} className="flex items-end gap-2 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Currency code</label>
                <input
                  type="text"
                  required
                  maxLength={3}
                  placeholder="USD"
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value)}
                  className="w-24 px-2 py-1 border rounded text-sm uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={enabling}
                className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Enable currency
              </button>
            </form>

            {enabledCurrencies.length === 0 ? (
              <p className="text-gray-500 text-sm">No foreign currencies enabled yet.</p>
            ) : (
              <div className="space-y-2">
                {enabledCurrencies.map((c) => (
                  <div key={c} className="flex items-center justify-between border border-gray-100 rounded-md px-3 py-2">
                    <span className="text-sm font-medium text-gray-900">{c}</span>
                    <button
                      type="button"
                      onClick={() => handleDisable(c)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Exchange rates</h2>
            <form onSubmit={handleAddRate} className="flex flex-wrap items-end gap-2 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <select value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} required className="px-2 py-1 border rounded text-sm">
                  <option value="">Select</option>
                  {allCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <select value={rateTo} onChange={(e) => setRateTo(e.target.value)} required className="px-2 py-1 border rounded text-sm">
                  <option value="">Select</option>
                  {allCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rate</label>
                <input
                  type="number"
                  required
                  step="0.000001"
                  min="0.000001"
                  value={rateValue}
                  onChange={(e) => setRateValue(e.target.value)}
                  className="w-28 px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Effective date</label>
                <input
                  type="date"
                  value={rateDate}
                  onChange={(e) => setRateDate(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={addingRate}
                className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add rate
              </button>
            </form>

            {ratesLoading ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : rates.length === 0 ? (
              <p className="text-gray-500 text-sm">No exchange rates set yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 font-medium">Pair</th>
                    <th className="py-2 font-medium">Rate</th>
                    <th className="py-2 font-medium">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 text-gray-900">{r.from_currency} → {r.to_currency}</td>
                      <td className="py-2 text-gray-700">{r.rate}</td>
                      <td className="py-2 text-gray-700">{r.effective_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
