// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { getTemplateForLawType, TEMPLATE_LABELS } from '@/lib/workflows/registry'

export default function MatterDetailPage() {
  const params = useParams()
  const matterId = params.id

  const [matter, setMatter] = useState(null)
  const [workflow, setWorkflow] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!matterId) return
    setLoading(true)
    const [mr, wr] = await Promise.all([
      fetch('/api/admin/matters?id=' + matterId).then((r) => r.json()),
      fetch('/api/admin/matters/workflow?matter_id=' + matterId).then((r) => r.json()),
    ])
    setMatter(mr.matter || null)
    setWorkflow(mr.matter ? wr : null)

    const supabase = createClient()
    const { data: taskRows } = await supabase
      .from('tasks')
      .select('*')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
    setTasks(taskRows || [])

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [matterId])

  const startWorkflow = async (template) => {
    setBusy(true)
    setError('')
    const res = await fetch('/api/admin/matters/workflow', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matter_id: matterId, template }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error || 'Failed to start workflow')
    setBusy(false)
    await load()
  }

  const advance = async (toStage) => {
    setBusy(true)
    setError('')
    const res = await fetch('/api/admin/matters/workflow/advance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matter_id: matterId, to_stage: toStage }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error || 'Failed to advance stage')
    setBusy(false)
    await load()
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>
  if (!matter) return <div className="p-8 text-gray-500">Matter not found.</div>

  const currentIndex = workflow?.stages
    ? workflow.stages.findIndex((s) => s.key === workflow.currentStage)
    : -1
  // A plain "Advance" only succeeds if some later stage isn't optional
  // -- array position alone isn't enough (e.g. Employment Law's last
  // two stages, Decision then the optional Appeal, have nothing
  // mandatory after Decision even though it isn't the last index).
  const hasNextMandatoryStage = workflow?.stages
    ? workflow.stages.slice(currentIndex + 1).some((s) => !s.optional)
    : false
  const nextOptionalStage = workflow?.stages?.[currentIndex + 1]?.optional ? workflow.stages[currentIndex + 1] : null
  const suggestedTemplate = getTemplateForLawType(matter?.law_type)
  const currentStageTasks = tasks.filter((t) =>
    workflow?.currentStage ? t.title.startsWith(
      workflow.stages.find((s) => s.key === workflow.currentStage)?.label + ':'
    ) : false
  )

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/admin/matters" className="text-sm text-blue-600 hover:underline mb-4 block">
        Find another matter
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{matter.matter_id}</span>
          <span className="text-xs px-2 py-0.5 rounded capitalize bg-gray-100 text-gray-600">{matter.status}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{matter.case_name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {[matter.clients?.name, matter.law_type].filter(Boolean).join(' · ')}
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {workflow?.template ? `${TEMPLATE_LABELS[workflow.template] || workflow.template} Workflow` : 'Workflow'}
        </h2>

        {!workflow?.template ? (
          <div>
            {suggestedTemplate ? (
              <>
                <p className="text-sm text-gray-500 mb-3">
                  This matter has no workflow tracker started yet.
                </p>
                <button
                  onClick={() => startWorkflow(suggestedTemplate)}
                  disabled={busy}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Start {TEMPLATE_LABELS[suggestedTemplate]} Workflow
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                No workflow template is available yet for {matter.law_type ? `"${matter.law_type}"` : 'this practice area'} matters.
              </p>
            )}
          </div>
        ) : (
          <>
            <ol className="space-y-2 mb-5">
              {workflow.stages.map((stage, i) => {
                const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'
                return (
                  <li
                    key={stage.key}
                    className={
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm ' +
                      (state === 'current'
                        ? 'bg-blue-50 border border-blue-200 font-medium text-blue-900'
                        : state === 'done'
                        ? 'text-gray-500'
                        : 'text-gray-400')
                    }
                  >
                    <span>{state === 'done' ? '✓' : i + 1}</span>
                    <span>{stage.label}</span>
                    {stage.optional && <span className="text-xs text-gray-400">(optional)</span>}
                  </li>
                )
              })}
            </ol>

            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={() => advance()}
                disabled={busy || !hasNextMandatoryStage}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Advance to next stage
              </button>
              {nextOptionalStage && (
                <button
                  onClick={() => advance(nextOptionalStage.key)}
                  disabled={busy}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Go to {nextOptionalStage.label} instead
                </button>
              )}
            </div>

            {currentStageTasks.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Current stage tasks</h3>
                <div className="space-y-1">
                  {currentStageTasks.map((t) => (
                    <div key={t.id} className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="capitalize text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{t.status}</span>
                      {t.title.split(': ').slice(1).join(': ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {workflow.history?.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">History</h3>
                <div className="space-y-1">
                  {workflow.history.map((h, i) => (
                    <p key={i} className="text-xs text-gray-500">
                      {new Date(h.created_at).toLocaleString()} — moved to {h.to_stage}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
