import { createClient } from '@supabase/supabase-js'
import type { WorkflowStage } from './types'
import { sendWorkflowNotification } from './notify'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type WorkflowMatter = {
  id: string
  tenant_id: string
  case_name: string
  client_id: string | null
  responsible_lawyer: string | null
  assigned_lawyer: string | null
  other_staff: string[] | null
  workflow_stage: string | null
}

async function teamEmails(matter: WorkflowMatter): Promise<string[]> {
  const userIds = [...new Set(
    [matter.responsible_lawyer, matter.assigned_lawyer, ...(matter.other_staff || [])].filter(
      (id): id is string => !!id
    )
  )]
  if (userIds.length === 0) return []

  const { data: users } = await supabaseAdmin.from('users').select('email').in('id', userIds)
  return (users || []).map((u) => u.email).filter(Boolean)
}

async function clientEmail(matter: WorkflowMatter): Promise<string | null> {
  if (!matter.client_id) return null
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('email')
    .eq('id', matter.client_id)
    .single()
  return client?.email || null
}

// Runs every automated side effect of entering `stage` for `matter`:
// creates its checklist tasks (TaskTrack), a deadline/hearing event if
// specified (CalenTrack, via the same generic matter-linking every other
// matter-linked event already uses), sends notifications (best-effort,
// never blocks), closes the matter if this is a closing stage, and logs
// one append-only history row.
export async function applyStageEntry(
  matter: WorkflowMatter,
  stage: WorkflowStage,
  triggeredByUserId: string
): Promise<void> {
  const tenantId = matter.tenant_id

  if (stage.tasks.length > 0) {
    const { error } = await supabaseAdmin.from('tasks').insert(
      stage.tasks.map((title) => ({
        tenant_id: tenantId,
        matter_id: matter.id,
        created_by: triggeredByUserId,
        title: `${stage.label}: ${title}`,
        priority: 'medium',
      }))
    )
    if (error) console.error(`workflow stage ${stage.key}: failed to create tasks`, error)
  }

  if (stage.createDeadline) {
    const startAt = new Date(Date.now() + stage.createDeadline.daysFromNow * 24 * 60 * 60 * 1000)
    const { error } = await supabaseAdmin.from('ft_calendar_events').insert({
      tenant_id: tenantId,
      created_by: triggeredByUserId,
      title: `${stage.createDeadline.label} — ${matter.case_name}`,
      event_type: 'deadline',
      start_at: startAt.toISOString(),
      end_at: startAt.toISOString(),
      all_day: true,
      status: 'scheduled',
      linked_module: 'matters',
      linked_id: matter.id,
    })
    if (error) console.error(`workflow stage ${stage.key}: failed to create deadline event`, error)
  }

  if (stage.notify?.length) {
    const subject = `${matter.case_name}: ${stage.label}`
    const html = `<p>Matter <strong>${matter.case_name}</strong> has moved to stage <strong>${stage.label}</strong>.</p>`

    if (stage.notify.includes('team')) {
      const emails = await teamEmails(matter)
      for (const to of emails) {
        await sendWorkflowNotification({ to, subject, html })
      }
    }
    if (stage.notify.includes('client')) {
      const to = await clientEmail(matter)
      if (to) await sendWorkflowNotification({ to, subject, html })
    }
  }

  if (stage.closesMatter) {
    // matters.status has a pre-existing check constraint allowing only
    // 'active' | 'inactive' | 'completed' -- there is no 'closed' value.
    const { error } = await supabaseAdmin.from('matters').update({ status: 'completed' }).eq('id', matter.id)
    if (error) console.error(`workflow stage ${stage.key}: failed to mark matter completed`, error)
  }

  const { error: historyError } = await supabaseAdmin.from('matter_workflow_history').insert({
    tenant_id: tenantId,
    matter_id: matter.id,
    from_stage: matter.workflow_stage,
    to_stage: stage.key,
    changed_by: triggeredByUserId,
  })
  if (historyError) console.error(`workflow stage ${stage.key}: failed to log history`, historyError)
}
