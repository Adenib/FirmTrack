// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function fmtUsd(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function iso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function presets() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const startOfLastMonth = new Date(endOfLastMonth.getFullYear(), endOfLastMonth.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31)
  const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1)

  return [
    { label: 'Month to Date', from: iso(startOfMonth), to: iso(now) },
    { label: 'End of Last Month', from: iso(startOfLastMonth), to: iso(endOfLastMonth) },
    { label: 'Year to Date', from: iso(startOfYear), to: iso(now) },
    { label: 'End of Last Year', from: iso(startOfLastYear), to: iso(endOfLastYear) },
  ]
}

export default function StatementsPage() {
  const [from, setFrom] = useState(() => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [to, setTo] = useState(() => iso(new Date()))
  const [incomeStatement, setIncomeStatement] = useState(null)
  const [balanceSheet, setBalanceSheet] = useState(null)
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/accounttrack/accounting-periods')
      .then((r) => r.json())
      .then((body) => setPeriods(body.periods || []))
      .catch(() => {})
  }, [])

  const run = async (fromDate, toDate) => {
    setLoading(true)
    setError('')
    const [isRes, bsRes] = await Promise.all([
      fetch(`/api/accounttrack/statements/income-statement?from=${fromDate}&to=${toDate}`),
      fetch(`/api/accounttrack/statements/balance-sheet?as_of=${toDate}`),
    ])
    const [isBody, bsBody] = await Promise.all([isRes.json(), bsRes.json()])
    if (!isRes.ok) setError(isBody.error || 'Could not load income statement')
    else setIncomeStatement(isBody)
    if (!bsRes.ok) setError(bsBody.error || 'Could not load balance sheet')
    else setBalanceSheet(bsBody)
    setLoading(false)
  }

  useEffect(() => {
    run(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const overlapsClosed = periods.some(
    (p) => p.status === 'closed' && p.period_start <= to && p.period_end >= from
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Statements</h1>
        <div className="flex items-center gap-4">
          <Link href="/accounttrack/accounting-periods" className="text-sm text-blue-600 hover:underline">
            Accounting Periods
          </Link>
          <Link href="/accounttrack" className="text-sm text-blue-600 hover:underline">
            ← AccountTrack
          </Link>
        </div>
      </div>
      <p className="text-gray-600 mb-6">Income Statement and Balance Sheet for any date range.</p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {presets().map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setFrom(p.from)
              setTo(p.to)
              run(p.from, p.to)
            }}
            className="text-xs px-3 py-1.5 border rounded-full text-gray-600 hover:border-gray-400"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To / As of</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 border rounded text-sm" />
        </div>
        <button
          type="button"
          onClick={() => run(from, to)}
          className="text-sm px-3 py-2 border rounded-md hover:bg-gray-50"
        >
          Run
        </button>
        {overlapsClosed && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
            Overlaps a closed period
          </span>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-500 text-sm mb-4">Loading...</p>}

      {incomeStatement && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <p className="font-medium text-gray-900 mb-3">
            Income Statement ({incomeStatement.from} to {incomeStatement.to})
          </p>

          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Revenue</p>
          {incomeStatement.revenue.length === 0 ? (
            <p className="text-sm text-gray-400 mb-2">—</p>
          ) : (
            incomeStatement.revenue.map((a) => (
              <div key={a.id} className="flex justify-between text-sm py-0.5">
                <span className="text-gray-700">{a.name}</span>
                <span className="text-gray-900">{fmtUsd(a.amount_usd)}</span>
              </div>
            ))
          )}
          <div className="flex justify-between text-sm font-medium border-t border-gray-100 mt-1 pt-1">
            <span>Total Revenue</span>
            <span>{fmtUsd(incomeStatement.total_revenue)}</span>
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mt-4 mb-1">Expense</p>
          {incomeStatement.expense.length === 0 ? (
            <p className="text-sm text-gray-400 mb-2">—</p>
          ) : (
            incomeStatement.expense.map((a) => (
              <div key={a.id} className="flex justify-between text-sm py-0.5">
                <span className="text-gray-700">{a.name}</span>
                <span className="text-gray-900">{fmtUsd(a.amount_usd)}</span>
              </div>
            ))
          )}
          <div className="flex justify-between text-sm font-medium border-t border-gray-100 mt-1 pt-1">
            <span>Total Expense</span>
            <span>{fmtUsd(incomeStatement.total_expense)}</span>
          </div>

          <div className="flex justify-between text-sm font-semibold border-t border-gray-200 mt-3 pt-2">
            <span>Net Income</span>
            <span>{fmtUsd(incomeStatement.net_income)}</span>
          </div>
        </div>
      )}

      {balanceSheet && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="font-medium text-gray-900 mb-3">Balance Sheet (as of {balanceSheet.as_of})</p>

          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Assets</p>
          {balanceSheet.assets.map((a) => (
            <div key={a.id} className="flex justify-between text-sm py-0.5">
              <span className="text-gray-700">{a.name}</span>
              <span className="text-gray-900">{fmtUsd(a.amount_usd)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-medium border-t border-gray-100 mt-1 pt-1">
            <span>Total Assets</span>
            <span>{fmtUsd(balanceSheet.total_assets)}</span>
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mt-4 mb-1">Liabilities</p>
          {balanceSheet.liabilities.map((a) => (
            <div key={a.id} className="flex justify-between text-sm py-0.5">
              <span className="text-gray-700">{a.name}</span>
              <span className="text-gray-900">{fmtUsd(a.amount_usd)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-medium border-t border-gray-100 mt-1 pt-1">
            <span>Total Liabilities</span>
            <span>{fmtUsd(balanceSheet.total_liabilities)}</span>
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mt-4 mb-1">Equity</p>
          <div className="flex justify-between text-sm py-0.5">
            <span className="text-gray-700">Retained Earnings</span>
            <span className="text-gray-900">{fmtUsd(balanceSheet.equity.retained_earnings)}</span>
          </div>
          <div className="flex justify-between text-sm py-0.5">
            <span className="text-gray-700">Current Year Earnings</span>
            <span className="text-gray-900">{fmtUsd(balanceSheet.equity.current_year_earnings)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium border-t border-gray-100 mt-1 pt-1">
            <span>Total Equity</span>
            <span>{fmtUsd(balanceSheet.total_equity)}</span>
          </div>

          <div className="flex justify-between text-sm font-semibold border-t border-gray-200 mt-3 pt-2">
            <span>Assets = Liabilities + Equity?</span>
            <span className={balanceSheet.balances ? 'text-green-700' : 'text-red-600'}>
              {balanceSheet.balances ? 'Balanced' : 'Out of balance'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
