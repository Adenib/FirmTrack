// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const STATUS_OPTIONS = ['open', 'in_progress', 'review', 'done', 'cancelled']
const PRIVILEGED_ROLES = ['owner', 'admin', 'manager']

function fmtStars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

export default function HRTrackPerformancePage() {
  const [tab, setTab] = useState('my')
  const [me, setMe] = useState(null)
  const [role, setRole] = useState('')
  const [users, setUsers] = useState([])
  const [tasks, setTasks] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Assign Task form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Evaluate form
  const [evalStaff, setEvalStaff] = useState('')
  const [evalPeriod, setEvalPeriod] = useState('')
  const [evalRating, setEvalRating] = useState(5)
  const [evalComments, setEvalComments] = useState('')
  const [evalSubmitting, setEvalSubmitting] = useState(false)
  const [evalError, setEvalError] = useState('')

  const isPrivileged = PRIVILEGED_ROLES.includes(role)

  const loadTasks = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    setTasks(data || [])
  }

  const loadEvaluations = async () => {
    const res = await fetch('/api/hrtrack/evaluations')
    const result = await res.json()
    if (res.ok) setEvaluations(result.evaluations || [])
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setMe(user)

      const [layoutRes, usersRes] = await Promise.all([
        fetch('/api/layout-data').then((r) => r.json()),
        fetch('/api/admin/clients/detail?type=users').then((r) => r.json()),
      ])
      setRole(layoutRes.profile?.role || '')
      setUsers(usersRes.users || [])

      await Promise.all([loadTasks(), loadEvaluations()])
      setLoading(false)
    }
    init()
  }, [])

  const emailFor = (userId) => users.find((u) => u.id === userId)?.email || 'Unassigned'

  const handleCreateTask = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/tasktrack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description, priority, due_date: dueDate || null, assigned_to: assignedTo || null }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Could not create task')
      setSubmitting(false)
      return
    }

    setTitle('')
    setDescription('')
    setPriority('medium')
    setDueDate('')
    setAssignedTo('')
    setSubmitting(false)
    await loadTasks()
    setTab('my')
  }

  const handleStatusChange = async (id, status) => {
    setError('')
    const res = await fetch('/api/tasktrack', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not update task')
    await loadTasks()
  }

  const handleEvaluate = async (e) => {
    e.preventDefault()
    setEvalSubmitting(true)
    setEvalError('')

    const res = await fetch('/api/hrtrack/evaluations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staff_user_id: evalStaff, period: evalPeriod, rating: Number(evalRating), comments: evalComments }),
    })
    const result = await res.json()
    if (!res.ok) {
      setEvalError(result.error || 'Could not save evaluation')
      setEvalSubmitting(false)
      return
    }
    setEvalPeriod('')
    setEvalComments('')
    setEvalRating(5)
    setEvalSubmitting(false)
    await loadEvaluations()
  }

  const myTasks = tasks.filter((t) => t.assigned_to === me?.id || (!t.assigned_to && t.created_by === me?.id))
  const reviewTasks = tasks.filter((t) => t.status === 'review')
  const myEvaluations = evaluations.filter((ev) => ev.staff_user_id === me?.id)

  const TABS = [
    { key: 'my', label: 'My Tasks' },
    { key: 'assign', label: 'Assign Task' },
    ...(isPrivileged ? [{ key: 'all', label: 'All Tasks' }] : []),
    { key: 'evaluate', label: 'Evaluate' },
    ...(isPrivileged ? [{ key: 'approvals', label: `Approvals${reviewTasks.length ? ` (${reviewTasks.length})` : ''}` }] : []),
  ]

  const renderTaskRow = (task) => (
    <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="font-medium text-gray-900">{task.title}</p>
        {task.description && <p className="text-sm text-gray-500">{task.description}</p>}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">{task.priority}</span>
          <span className="text-xs text-gray-500">Assigned: {emailFor(task.assigned_to)}</span>
          {task.due_date && <span className="text-xs text-gray-500">Due {task.due_date}</span>}
        </div>
      </div>
      <select
        value={task.status}
        onChange={(e) => handleStatusChange(task.id, e.target.value)}
        className="text-sm px-2 py-1 border rounded-md capitalize"
      >
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
      </select>
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-4">Tasks, assignments, evaluations, and approvals.</p>

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
          {tab === 'my' && (
            <div className="space-y-2">
              {myTasks.length === 0 ? <p className="text-gray-500 text-sm">No tasks assigned to you.</p> : myTasks.map(renderTaskRow)}
            </div>
          )}

          {tab === 'assign' && (
            <form onSubmit={handleCreateTask} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" required placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-3 py-2 border rounded-md text-sm">
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="px-3 py-2 border rounded-md text-sm">
                  <option value="">Assign to...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
              </div>
              <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'Assigning...' : 'Assign task'}
              </button>
            </form>
          )}

          {tab === 'all' && isPrivileged && (
            <div className="space-y-2">
              {tasks.length === 0 ? <p className="text-gray-500 text-sm">No tasks yet.</p> : tasks.map(renderTaskRow)}
            </div>
          )}

          {tab === 'evaluate' && (
            <div>
              {isPrivileged && (
                <form onSubmit={handleEvaluate} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg mb-6">
                  <p className="font-medium text-gray-900">New evaluation</p>
                  <select required value={evalStaff} onChange={(e) => setEvalStaff(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                    <option value="">Select staff member...</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" placeholder="Period (e.g. Q3 2026)" value={evalPeriod} onChange={(e) => setEvalPeriod(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
                    <select value={evalRating} onChange={(e) => setEvalRating(e.target.value)} className="px-3 py-2 border rounded-md text-sm">
                      {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{fmtStars(n)} ({n})</option>)}
                    </select>
                  </div>
                  <textarea placeholder="Comments" value={evalComments} onChange={(e) => setEvalComments(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
                  {evalError && <p className="text-red-600 text-xs">{evalError}</p>}
                  <button type="submit" disabled={evalSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                    {evalSubmitting ? 'Saving...' : 'Save evaluation'}
                  </button>
                </form>
              )}

              <p className="font-medium text-gray-900 mb-2">{isPrivileged ? 'All evaluations' : 'Your evaluations'}</p>
              <div className="space-y-2">
                {(isPrivileged ? evaluations : myEvaluations).length === 0 ? (
                  <p className="text-gray-500 text-sm">No evaluations yet.</p>
                ) : (
                  (isPrivileged ? evaluations : myEvaluations).map((ev) => (
                    <div key={ev.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">{ev.staff?.email}</p>
                        <span className="text-amber-500">{fmtStars(ev.rating)}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {ev.period ? `${ev.period} · ` : ''}Reviewed by {ev.reviewer?.email} on {new Date(ev.created_at).toLocaleDateString()}
                      </p>
                      {ev.comments && <p className="text-sm text-gray-700 mt-1">{ev.comments}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'approvals' && isPrivileged && (
            <div className="space-y-2">
              {reviewTasks.length === 0 ? (
                <p className="text-gray-500 text-sm">Nothing pending approval.</p>
              ) : (
                reviewTasks.map((task) => (
                  <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-500">Assigned: {emailFor(task.assigned_to)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => handleStatusChange(task.id, 'done')} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700">
                        Approve
                      </button>
                      <button type="button" onClick={() => handleStatusChange(task.id, 'in_progress')} className="text-xs border px-3 py-1.5 rounded-md hover:bg-gray-50">
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
