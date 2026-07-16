'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Task = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_date: string | null
  created_at: string
}

const STATUS_OPTIONS = ['open', 'in_progress', 'review', 'done', 'cancelled']

export default function HRTrackPerformancePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadTasks = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setTasks(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/tasktrack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description, priority, due_date: dueDate || null }),
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
    setSubmitting(false)
    await loadTasks()
  }

  const handleStatusChange = async (id: string, status: string) => {
    await fetch('/api/tasktrack', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    await loadTasks()
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
        <Link href="/hrtrack" className="text-sm text-blue-600 hover:underline">← HRTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Create and manage tasks for your organization.</p>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            required
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
          rows={2}
        />

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add task'}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      {loading ? (
        <p className="text-gray-500">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className="text-gray-500">No tasks yet. Add your first one above.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">{task.title}</p>
                {task.description && (
                  <p className="text-sm text-gray-500">{task.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">
                    {task.priority}
                  </span>
                  {task.due_date && (
                    <span className="text-xs text-gray-500">Due {task.due_date}</span>
                  )}
                </div>
              </div>

              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value)}
                className="text-sm px-2 py-1 border rounded-md capitalize"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
