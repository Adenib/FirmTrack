// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

type Category = {
  id: string
  name: string
  sort_order: number
}

type UserOption = {
  id: string
  email: string
  role: string
}

type LawyerRate = {
  rate_type: string
  amount_usd: number
  effective_from: string
}

type Lawyer = {
  id: string
  user_id: string
  full_name: string
  nickname: string
  initials: string
  category_id: string | null
  status: string
  lawyer_categories: { name: string } | null
  users: { email: string } | null
  lawyer_rates: LawyerRate[]
}

const RATE_TYPES = ['A', 'B', 'C', 'D', 'E']

const formatNGN = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

export default function LawyersPage() {
  const [lawyers, setLawyers] = useState<Lawyer[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [exchangeRate, setExchangeRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [userId, setUserId] = useState('')
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [initials, setInitials] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('active')
  const [addedRates, setAddedRates] = useState([])
  const [rateType, setRateType] = useState('A')
  const [rateAmount, setRateAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')

    const response = await fetch('/api/admin/lawyers')
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not load lawyers')
      setLoading(false)
      return
    }

    setLawyers(result.lawyers || [])
    setCategories(result.categories || [])
    setUsers(result.users || [])
    setExchangeRate(result.exchangeRate?.rate || 0)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const ngnToUsd = (ngn: number) => (exchangeRate > 0 ? ngn / exchangeRate : 0)

  const availableRateTypes = RATE_TYPES.filter((t) => !addedRates.some((r) => r.type === t))

  const handleAddRate = () => {
    const ngn = Number(rateAmount)
    if (!rateType || !ngn || ngn <= 0) return

    setAddedRates([...addedRates, { type: rateType, ngn }])
    setRateAmount('')
    const next = RATE_TYPES.find((t) => t !== rateType && !addedRates.some((r) => r.type === t))
    setRateType(next || '')
  }

  const handleRemoveRate = (type: string) => {
    setAddedRates(addedRates.filter((r) => r.type !== type))
  }

  const getRateUsd = (lawyer: Lawyer, type: string) =>
    lawyer.lawyer_rates?.find((r) => r.rate_type === type)?.amount_usd ?? null

  const resetForm = () => {
    setUserId('')
    setFullName('')
    setNickname('')
    setInitials('')
    setCategoryId('')
    setStatus('active')
    setAddedRates([])
    setRateType('A')
    setRateAmount('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const rates = addedRates.map((r) => ({
      rate_type: r.type,
      amount_usd: ngnToUsd(r.ngn),
    }))

    const response = await fetch('/api/admin/lawyers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        full_name: fullName,
        nickname: nickname.toUpperCase(),
        initials: initials.toUpperCase(),
        category_id: categoryId || null,
        status,
        rates,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not create lawyer')
      setSubmitting(false)
      return
    }

    resetForm()
    setSubmitting(false)
    await loadData()
  }

  const handleToggleStatus = async (lawyer: Lawyer) => {
    const nextStatus = lawyer.status === 'active' ? 'inactive' : 'active'

    const response = await fetch('/api/admin/lawyers', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: lawyer.id, status: nextStatus }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Could not update lawyer')
      return
    }

    await loadData()
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Lawyers</h1>
      <p className="text-gray-600 mb-6">Manage lawyers, categories and billing rates.</p>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">FirmTrack user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>

          <input
            type="text"
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />

          <input
            type="text"
            required
            placeholder="Nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.toUpperCase())}
            className="px-3 py-2 border rounded-md uppercase"
          />

          <input
            type="text"
            required
            placeholder="Initials"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            className="px-3 py-2 border rounded-md uppercase"
          />

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Rates (A–E)</p>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rate</label>
              <select
                value={rateType}
                onChange={(e) => setRateType(e.target.value)}
                disabled={availableRateTypes.length === 0}
                className="px-3 py-2 border rounded-md text-sm"
              >
                {availableRateTypes.length === 0 ? (
                  <option value="">All rates added</option>
                ) : (
                  availableRateTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount (NGN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="NGN"
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
                disabled={availableRateTypes.length === 0}
                className="px-3 py-2 border rounded-md"
              />
            </div>

            <button
              type="button"
              onClick={handleAddRate}
              disabled={availableRateTypes.length === 0 || !rateAmount}
              className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Add rate
            </button>

            {rateAmount && Number(rateAmount) > 0 && (
              <p className="text-xs text-gray-400 pb-2">≈ {formatUSD(ngnToUsd(Number(rateAmount)))}</p>
            )}
          </div>

          {addedRates.length > 0 && (
            <div className="mt-3 space-y-1">
              {addedRates.map((r) => (
                <div
                  key={r.type}
                  className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                >
                  <span>
                    <span className="font-medium text-gray-700">Rate {r.type}:</span>{' '}
                    <span className="text-gray-600">{formatNGN(r.ngn)}</span>{' '}
                    <span className="text-gray-400">(≈ {formatUSD(ngnToUsd(r.ngn))})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRate(r.type)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add lawyer'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : lawyers.length === 0 ? (
        <p className="text-gray-500">No lawyers yet. Add your first one above.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Nickname</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Initials</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">A Rate (NGN)</th>
                <th className="px-4 py-2 font-medium">B Rate (NGN)</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lawyers.map((lawyer) => {
                const rateA = getRateUsd(lawyer, 'A')
                const rateB = getRateUsd(lawyer, 'B')

                return (
                  <tr key={lawyer.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-gray-900">{lawyer.nickname}</td>
                    <td className="px-4 py-2 text-gray-700">{lawyer.full_name}</td>
                    <td className="px-4 py-2 text-gray-700">{lawyer.initials}</td>
                    <td className="px-4 py-2 text-gray-700">{lawyer.lawyer_categories?.name || '—'}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {rateA !== null ? formatNGN(rateA * exchangeRate) : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {rateB !== null ? formatNGN(rateB * exchangeRate) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          lawyer.status === 'active'
                            ? 'text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full'
                            : 'text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full'
                        }
                      >
                        {lawyer.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleToggleStatus(lawyer)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {lawyer.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
