// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const PAYROLL_PRIVILEGED = ['owner', 'admin']

function fmtAmount(n) {
  return '₦' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function deductionsTotal(deductions) {
  return (deductions || []).reduce((sum, d) => sum + Number(d.amount || 0), 0)
}

function netPay(lineItem) {
  return Number(lineItem.base_salary) + Number(lineItem.leave_allowance) - deductionsTotal(lineItem.deductions)
}

const statusColor = {
  draft: 'bg-amber-100 text-amber-700',
  posted: 'bg-green-100 text-green-700',
}

export default function HRTrackPayrollPage() {
  const [tab, setTab] = useState('my-payslips')
  const [role, setRole] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [myPayslips, setMyPayslips] = useState([])

  const [salaries, setSalaries] = useState([])
  const [salaryUserId, setSalaryUserId] = useState('')
  const [salaryAmount, setSalaryAmount] = useState('')
  const [salaryEffectiveFrom, setSalaryEffectiveFrom] = useState('')
  const [savingSalary, setSavingSalary] = useState(false)

  const [runs, setRuns] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [payDate, setPayDate] = useState('')
  const [creatingRun, setCreatingRun] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState(null)
  const [deductionDrafts, setDeductionDrafts] = useState({})

  const isPrivileged = PAYROLL_PRIVILEGED.includes(role)

  const loadMyPayslips = async () => {
    const res = await fetch('/api/hrtrack/payroll/my-payslips')
    const result = await res.json()
    if (res.ok) setMyPayslips(result.lineItems || [])
  }

  const loadSalaries = async () => {
    const res = await fetch('/api/hrtrack/payroll/salaries')
    const result = await res.json()
    if (res.ok) setSalaries(result.salaries || [])
  }

  const loadRuns = async () => {
    const res = await fetch('/api/hrtrack/payroll/runs')
    const result = await res.json()
    if (res.ok) {
      setRuns(result.runs || [])
      setLineItems(result.lineItems || [])
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const [layoutRes, usersRes] = await Promise.all([
        fetch('/api/layout-data').then((r) => r.json()),
        fetch('/api/admin/clients/detail?type=users').then((r) => r.json()),
      ])
      const userRole = layoutRes.profile?.role || ''
      setRole(userRole)
      setUsers(usersRes.users || [])
      await loadMyPayslips()
      if (PAYROLL_PRIVILEGED.includes(userRole)) {
        await Promise.all([loadSalaries(), loadRuns()])
      }
      setLoading(false)
    }
    init()
  }, [])

  const emailFor = (userId) => users.find((u) => u.id === userId)?.email || 'Unknown'

  const currentSalaryByUser = () => {
    const map = new Map()
    for (const s of salaries) {
      if (!map.has(s.user_id)) map.set(s.user_id, s)
    }
    return map
  }

  const handleSetSalary = async (e) => {
    e.preventDefault()
    setSavingSalary(true)
    setError('')
    const res = await fetch('/api/hrtrack/payroll/salaries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: salaryUserId, amount: Number(salaryAmount), effective_from: salaryEffectiveFrom }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not set salary')
    } else {
      setSalaryUserId(''); setSalaryAmount(''); setSalaryEffectiveFrom('')
      await loadSalaries()
    }
    setSavingSalary(false)
  }

  const handleCreateRun = async (e) => {
    e.preventDefault()
    setCreatingRun(true)
    setError('')
    const res = await fetch('/api/hrtrack/payroll/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ period_start: periodStart, period_end: periodEnd, pay_date: payDate }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not create payroll run')
    } else {
      setPeriodStart(''); setPeriodEnd(''); setPayDate('')
      await loadRuns()
      setExpandedRunId(result.run.id)
    }
    setCreatingRun(false)
  }

  const handleDeleteRun = async (id) => {
    await fetch('/api/hrtrack/payroll/runs', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (expandedRunId === id) setExpandedRunId(null)
    await loadRuns()
  }

  const handlePostRun = async (id) => {
    setError('')
    const res = await fetch('/api/hrtrack/payroll/runs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action: 'post' }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not post payroll run')
    await loadRuns()
  }

  const draftFor = (lineItem) => deductionDrafts[lineItem.id] || lineItem.deductions || []

  const addDeduction = (lineItem) => {
    setDeductionDrafts((prev) => ({
      ...prev,
      [lineItem.id]: [...draftFor(lineItem), { name: '', amount: 0 }],
    }))
  }

  const updateDeduction = (lineItem, index, field, value) => {
    const next = draftFor(lineItem).map((d, i) => (i === index ? { ...d, [field]: field === 'amount' ? Number(value) : value } : d))
    setDeductionDrafts((prev) => ({ ...prev, [lineItem.id]: next }))
  }

  const removeDeduction = (lineItem, index) => {
    setDeductionDrafts((prev) => ({ ...prev, [lineItem.id]: draftFor(lineItem).filter((_, i) => i !== index) }))
  }

  const saveDeductions = async (lineItem, runId) => {
    setError('')
    const res = await fetch('/api/hrtrack/payroll/runs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: runId, action: 'update_deductions', lineItemId: lineItem.id, deductions: draftFor(lineItem) }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not save deductions')
    await loadRuns()
  }

  const viewPayslip = (lineItemId) => {
    const link = document.createElement('a')
    link.href = `/api/hrtrack/payroll/payslip?line_item_id=${lineItemId}`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
  }

  const sendPayslip = async (lineItemId) => {
    setError('')
    const res = await fetch('/api/hrtrack/payroll/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ line_item_id: lineItemId }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not send payslip')
    else await loadRuns()
  }

  const TABS = [
    { key: 'my-payslips', label: 'My Payslips' },
    ...(isPrivileged ? [{ key: 'salaries', label: 'Salaries' }, { key: 'runs', label: 'Runs' }] : []),
  ]

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-4">Salaries, payroll runs, and payslips.</p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {tab === 'my-payslips' && (
            <div>
              {myPayslips.length === 0 ? (
                <p className="text-gray-500 text-sm">No payslips yet.</p>
              ) : (
                <div className="space-y-2">
                  {myPayslips.map((li) => (
                    <div key={li.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{li.payroll_runs?.period_start} → {li.payroll_runs?.period_end}</p>
                        <p className="text-sm text-gray-600">Pay date: {li.payroll_runs?.pay_date} · Net pay: {fmtAmount(netPay(li))}</p>
                      </div>
                      <button type="button" onClick={() => viewPayslip(li.id)} className="text-sm text-blue-600 hover:underline">View</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'salaries' && isPrivileged && (
            <div>
              <form onSubmit={handleSetSalary} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
                <select required value={salaryUserId} onChange={(e) => setSalaryUserId(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Employee...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
                <input type="number" required min="0" step="0.01" placeholder="Monthly salary (₦)" value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                <input type="date" required value={salaryEffectiveFrom} onChange={(e) => setSalaryEffectiveFrom(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                <button type="submit" disabled={savingSalary} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {savingSalary ? 'Saving...' : 'Set salary'}
                </button>
              </form>

              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Employee</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Current Salary</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Effective From</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Array.from(currentSalaryByUser().values()).map((s) => (
                      <tr key={s.user_id}>
                        <td className="px-4 py-3 text-gray-900">{s.users?.email || emailFor(s.user_id)}</td>
                        <td className="px-4 py-3 text-gray-700">{fmtAmount(s.amount)}</td>
                        <td className="px-4 py-3 text-gray-700">{s.effective_from}</td>
                      </tr>
                    ))}
                    {salaries.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-3 text-gray-500">No salaries set yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'runs' && isPrivileged && (
            <div>
              <form onSubmit={handleCreateRun} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Period start</label>
                    <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Period end</label>
                    <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pay date</label>
                  <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
                <button type="submit" disabled={creatingRun} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {creatingRun ? 'Creating...' : 'New run'}
                </button>
              </form>

              <div className="space-y-3">
                {runs.map((run) => {
                  const items = lineItems.filter((li) => li.payroll_run_id === run.id)
                  const totalNet = items.reduce((sum, li) => sum + netPay(li), 0)
                  const expanded = expandedRunId === run.id
                  return (
                    <div key={run.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setExpandedRunId(expanded ? null : run.id)} className="text-left">
                          <p className="font-medium text-gray-900">{run.period_start} → {run.period_end}</p>
                          <p className="text-sm text-gray-600">Pay date: {run.pay_date} · {items.length} employee{items.length === 1 ? '' : 's'} · Total net: {fmtAmount(totalNet)}</p>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[run.status]}`}>{run.status}</span>
                          {run.status === 'draft' && (
                            <>
                              <button type="button" onClick={() => handlePostRun(run.id)} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700">Post run</button>
                              <button type="button" onClick={() => handleDeleteRun(run.id)} className="text-xs border px-3 py-1.5 rounded-md hover:bg-gray-50">Delete</button>
                            </>
                          )}
                        </div>
                      </div>

                      {expanded && (
                        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                          {items.map((li) => (
                            <div key={li.id} className="border border-gray-100 rounded-md p-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-medium text-gray-900 text-sm">{li.users?.email || emailFor(li.user_id)}</p>
                                <p className="text-sm text-gray-700">Net: {fmtAmount(run.status === 'draft' ? netPay({ ...li, deductions: draftFor(li) }) : netPay(li))}</p>
                              </div>
                              <p className="text-xs text-gray-500 mb-2">
                                Base: {fmtAmount(li.base_salary)}
                                {Number(li.leave_allowance) > 0 && ` · Leave allowance: ${fmtAmount(li.leave_allowance)}`}
                              </p>

                              {run.status === 'draft' ? (
                                <div className="space-y-1">
                                  {draftFor(li).map((d, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <input type="text" placeholder="Deduction name" value={d.name} onChange={(e) => updateDeduction(li, i, 'name', e.target.value)} className="flex-1 px-2 py-1 border rounded text-xs" />
                                      <input type="number" step="0.01" placeholder="Amount" value={d.amount} onChange={(e) => updateDeduction(li, i, 'amount', e.target.value)} className="w-28 px-2 py-1 border rounded text-xs" />
                                      <button type="button" onClick={() => removeDeduction(li, i)} className="text-xs text-red-500 hover:underline">Remove</button>
                                    </div>
                                  ))}
                                  <div className="flex items-center gap-2 mt-2">
                                    <button type="button" onClick={() => addDeduction(li)} className="text-xs border px-2 py-1 rounded-md hover:bg-gray-50">Add deduction</button>
                                    <button type="button" onClick={() => saveDeductions(li, run.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-md hover:bg-blue-700">Save deductions</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  {(li.deductions || []).length > 0 && (
                                    <p className="text-xs text-gray-500">Deductions: {li.deductions.map((d) => `${d.name} (${fmtAmount(d.amount)})`).join(', ')}</p>
                                  )}
                                  <button type="button" onClick={() => viewPayslip(li.id)} className="text-xs text-blue-600 hover:underline">View payslip</button>
                                  <button type="button" onClick={() => sendPayslip(li.id)} className="text-xs text-blue-600 hover:underline">
                                    {li.sent_at ? 'Resend payslip' : 'Send payslip'}
                                  </button>
                                  {li.sent_at && <span className="text-xs text-gray-400">Sent {new Date(li.sent_at).toLocaleDateString()}</span>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {runs.length === 0 && <p className="text-gray-500 text-sm">No payroll runs yet.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
