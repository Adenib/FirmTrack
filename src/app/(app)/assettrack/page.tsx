// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function AssetTrackOverviewPage() {
  const [tickets, setTickets] = useState([])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const [ticketsRes, assetsRes] = await Promise.all([
        fetch('/api/assettrack/tickets').then((r) => r.json()),
        fetch('/api/assettrack/assets').then((r) => r.json()),
      ])
      setTickets(ticketsRes.tickets || [])
      setAssets(assetsRes.assets || [])
      setLoading(false)
    }
    init()
  }, [])

  const open = tickets.filter((t) => !['closed', 'cancelled'].includes(t.status)).length
  const active = assets.filter((a) => a.asset_status === 'active').length
  const inRepair = assets.filter((a) => a.asset_status === 'in_repair').length

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">AssetTrack</h1>
      <p className="text-gray-600 mb-6">Laptop repair tickets and IT asset lifecycle, from fault report to closure.</p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">Open tickets</p>
            <p className="text-2xl font-semibold text-gray-900">{open}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">Laptops in repair</p>
            <p className="text-2xl font-semibold text-gray-900">{inRepair}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">Active laptops</p>
            <p className="text-2xl font-semibold text-gray-900">{active}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/assettrack/tickets" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">
          Tickets
        </Link>
        <Link href="/assettrack/assets" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">
          Asset Register
        </Link>
      </div>
    </div>
  )
}
