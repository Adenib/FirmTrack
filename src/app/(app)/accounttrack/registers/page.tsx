// @ts-nocheck
'use client'

import { useState } from 'react'
import Link from 'next/link'
import TimeRegister from '@/components/accounttrack/registers/time-register'
import TrustRegister from '@/components/accounttrack/registers/trust-register'
import ExpenseRegister from '@/components/accounttrack/registers/expense-register'
import InvoiceRegister from '@/components/accounttrack/registers/invoice-register'
import MatterRegister from '@/components/accounttrack/registers/matter-register'
import GeneralJournalRegister from '@/components/accounttrack/registers/general-journal-register'
import LedgerRegister from '@/components/accounttrack/registers/ledger-register'

const TABS = [
  { key: 'time', label: 'Time' },
  { key: 'general', label: 'General' },
  { key: 'trust', label: 'Trust' },
  { key: 'expense', label: 'Expense' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'matter', label: 'Matter' },
]

export default function RegistersPage() {
  const [activeTab, setActiveTab] = useState('time')

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Registers</h1>
        <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">
          ← AccountTrack
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Tenant-wide read-only views: Time, General (journal), Trust, Expense, Invoice, Ledger
        (by account), and Matter registers.
      </p>

      <div className="flex items-center gap-2 mb-6 border-b border-gray-200 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={
              activeTab === tab.key
                ? 'text-sm px-3 py-2 border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-sm px-3 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'time' && <TimeRegister />}
      {activeTab === 'general' && <GeneralJournalRegister />}
      {activeTab === 'trust' && <TrustRegister />}
      {activeTab === 'expense' && <ExpenseRegister />}
      {activeTab === 'invoice' && <InvoiceRegister />}
      {activeTab === 'ledger' && <LedgerRegister />}
      {activeTab === 'matter' && <MatterRegister />}
    </div>
  )
}
