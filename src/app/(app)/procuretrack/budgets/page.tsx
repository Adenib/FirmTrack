// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'

export default function BudgetsPage() {
  const [departments, setDepartments] = useState([])
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [deptName, setDeptName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [deptRes, budgetRes] = await Promise.all([
      fetch('/api/procuretrack/departments').then((r) => r.json()),
      fetch('/api/procuretrack/budgets').then((r) => r.json()),
    ])
    setDepartments(deptRes.departments || [])
    setBudgets(budgetRes.budgets || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addDepartment = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/departments', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: deptName }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setDeptName(''); await load() }
    setSubmitting(false)
  }

  const addBudget = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/procuretrack/budgets', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ department_id: departmentId, period_start: periodStart, period_end: periodEnd, amount: Number(amount) }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error)
    else { setDepartmentId(''); setPeriodStart(''); setPeriodEnd(''); setAmount(''); await load() }
    setSubmitting(false)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Departments & Budgets</h1>
      <p className="text-gray-600 mb-6">Committed (open POs) and actual (paid invoices) are computed live, never stored.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <form onSubmit={addDepartment} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm">New department</h2>
          <input required placeholder="Department name" value={deptName} onChange={(e) => setDeptName(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Add department</button>
        </form>

        <form onSubmit={addBudget} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm">New budget</h2>
          <select required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input required type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
            <input required type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <input required type="number" min="0" placeholder="Budget amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          <button disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Add budget</button>
        </form>
      </div>

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
        <div className="space-y-3">
          {budgets.map((b) => (
            <div key={b.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="font-medium text-gray-900">{b.department?.name} -- {b.period_start} to {b.period_end}</p>
              <p className="text-xs text-gray-500 mt-1">
                Budgeted {Number(b.usage.budgeted).toLocaleString()} · Committed {Number(b.usage.committed).toLocaleString()} ·
                Actual {Number(b.usage.actual).toLocaleString()} ·{' '}
                <span className={b.usage.remaining < 0 ? 'text-red-600 font-medium' : ''}>Remaining {Number(b.usage.remaining).toLocaleString()}</span>
              </p>
            </div>
          ))}
          {budgets.length === 0 && <p className="text-sm text-gray-500">No budgets yet.</p>}
        </div>
      )}
    </div>
  )
}
