// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function ReportsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      const res = await fetch('/api/procuretrack/reports')
      const body = await res.json()
      if (!res.ok) setError(body.error)
      else setData(body)
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <div className="p-8"><p className="text-gray-500 text-sm">Loading...</p></div>
  if (error) return <div className="p-8"><p className="text-sm text-red-600">{error}</p></div>

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Reports</h1>
      <p className="text-gray-600 mb-6">Spend, cycle time, RFQ savings, and delivery performance.</p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Total POs</p>
          <p className="text-2xl font-semibold text-gray-900">{data.totalPoCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Avg PO cycle time</p>
          <p className="text-2xl font-semibold text-gray-900">{data.avgPoCycleDays ?? '--'}{data.avgPoCycleDays != null ? 'd' : ''}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Estimated RFQ savings</p>
          <p className="text-2xl font-semibold text-gray-900">{data.estimatedRfqSavings != null ? data.estimatedRfqSavings.toLocaleString() : '--'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Late deliveries</p>
          <p className="text-2xl font-semibold text-gray-900">{data.lateDeliveries}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-2 text-sm">Spend by vendor</h2>
          {Object.entries(data.spendByVendor).map(([name, amount]) => (
            <div key={name} className="flex justify-between text-sm py-1 border-t border-gray-100 first:border-0">
              <span>{name}</span><span>{Number(amount).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-2 text-sm">Spend by department</h2>
          {Object.entries(data.spendByDepartment).map(([name, amount]) => (
            <div key={name} className="flex justify-between text-sm py-1 border-t border-gray-100 first:border-0">
              <span>{name}</span><span>{Number(amount).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
