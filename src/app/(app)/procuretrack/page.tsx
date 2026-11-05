// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function ProcureTrackOverviewPage() {
  const [requisitions, setRequisitions] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const [layoutRes, reqRes, poRes] = await Promise.all([
        fetch('/api/layout-data').then((r) => r.json()),
        fetch('/api/procuretrack/requisitions').then((r) => r.json()),
        fetch('/api/procuretrack/purchase-orders').then((r) => r.json()),
      ])
      setRole(layoutRes.profile?.role || '')
      setRequisitions(reqRes.requisitions || [])
      setPurchaseOrders(poRes.purchaseOrders || [])
      setLoading(false)
    }
    init()
  }, [])

  const pendingApproval = requisitions.filter((r) => r.status === 'pending_approval').length
  const openPos = purchaseOrders.filter((p) => ['issued', 'partially_received'].includes(p.status)).length
  const totalCommitted = purchaseOrders
    .filter((p) => !['cancelled'].includes(p.status))
    .reduce((sum, p) => sum + Number(p.total_amount), 0)

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ProcureTrack</h1>
      <p className="text-gray-600 mb-6">Requisition through approval, RFQ, purchase order, goods receipt, invoicing, and payment.</p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">Awaiting approval</p>
            <p className="text-2xl font-semibold text-gray-900">{pendingApproval}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">Open purchase orders</p>
            <p className="text-2xl font-semibold text-gray-900">{openPos}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">Total committed spend</p>
            <p className="text-2xl font-semibold text-gray-900">{totalCommitted.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/procuretrack/requisitions" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Requisitions</Link>
        <Link href="/procuretrack/vendors" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Vendors</Link>
        <Link href="/procuretrack/catalog" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Catalog</Link>
        <Link href="/procuretrack/rfqs" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">RFQs</Link>
        <Link href="/procuretrack/purchase-orders" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Purchase Orders</Link>
        <Link href="/procuretrack/goods-receipts" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Goods Receipts</Link>
        <Link href="/procuretrack/invoices" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Invoices</Link>
        <Link href="/procuretrack/payments" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Payments</Link>
        <Link href="/procuretrack/contracts" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Contracts</Link>
        <Link href="/procuretrack/budgets" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Budgets</Link>
        <Link href="/procuretrack/reports" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Reports</Link>
        {['owner', 'admin'].includes(role) && (
          <Link href="/procuretrack/settings" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50">Settings</Link>
        )}
      </div>
    </div>
  )
}
