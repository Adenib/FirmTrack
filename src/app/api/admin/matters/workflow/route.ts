import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessMatterDocument } from '@/lib/doctrack/permissions'
import { getNextStage, getWorkflowStages } from '@/lib/workflows/registry'
import { applyStageEntry, type WorkflowMatter } from '@/lib/workflows/engine'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MATTER_SELECT =
  'id, tenant_id, case_name, client_id, responsible_lawyer, assigned_lawyer, other_staff, workflow_template, workflow_stage'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const matterId = searchParams.get('matter_id')
  if (!matterId) return NextResponse.json({ error: 'matter_id is required' }, { status: 400 })

  const { data: matter } = await supabaseAdmin
    .from('matters').select(MATTER_SELECT).eq('id', matterId).eq('tenant_id', profile.tenant_id).single()
  if (!matter) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  if (!canAccessMatterDocument(profile, matter)) {
    return NextResponse.json({ error: 'Not authorized for this matter' }, { status: 403 })
  }

  const stages = matter.workflow_template ? getWorkflowStages(matter.workflow_template) || [] : []

  const { data: history } = await supabaseAdmin
    .from('matter_workflow_history')
    .select('from_stage, to_stage, changed_by, created_at')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    template: matter.workflow_template,
    currentStage: matter.workflow_stage,
    stages,
    history: history || [],
  })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { matter_id, template } = await request.json()
  if (!matter_id) return NextResponse.json({ error: 'matter_id is required' }, { status: 400 })

  const { data: matter } = await supabaseAdmin
    .from('matters').select(MATTER_SELECT).eq('id', matter_id).eq('tenant_id', profile.tenant_id).single()
  if (!matter) return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  if (!canAccessMatterDocument(profile, matter)) {
    return NextResponse.json({ error: 'Not authorized for this matter' }, { status: 403 })
  }
  if (matter.workflow_template) {
    return NextResponse.json({ error: 'This matter already has a workflow started' }, { status: 400 })
  }

  const workflowTemplate = template || 'litigation'
  const firstStage = getNextStage(workflowTemplate, null)
  if (!firstStage) return NextResponse.json({ error: `Unknown workflow template: ${workflowTemplate}` }, { status: 400 })

  const startedAt = new Date().toISOString()
  await supabaseAdmin
    .from('matters')
    .update({ workflow_template: workflowTemplate, workflow_started_at: startedAt, workflow_stage: firstStage.key })
    .eq('id', matter_id)

  await applyStageEntry(matter as WorkflowMatter, firstStage, profile.id)

  return NextResponse.json({ template: workflowTemplate, currentStage: firstStage.key })
}
