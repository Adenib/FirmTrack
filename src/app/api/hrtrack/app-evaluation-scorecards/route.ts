import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRIVILEGED_ROLES = ['owner', 'admin', 'manager', 'hr']

// Category key -> its weight (must sum to 1). Hardcoded here, matching the
// spec exactly -- never trust a client-sent total_score.
const CATEGORY_WEIGHTS = {
  legal_accuracy: 0.20,
  legal_research_citations: 0.15,
  drafting_quality: 0.15,
  document_review_analysis: 0.10,
  productivity_time_savings: 0.10,
  usability_ux: 0.10,
  security_confidentiality: 0.10,
  workflow_integration: 0.05,
  reliability_performance: 0.025,
  cost_roi_scalability: 0.025,
} as const

type CategoryKey = keyof typeof CATEGORY_WEIGHTS

// Tenant-wide readable -- app evaluation results are meant to be visible
// to the whole firm, not just the evaluators who wrote them.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const applicationName = searchParams.get('application_name')

  let query = supabaseAdmin
    .from('app_evaluation_scorecards')
    .select('*, evaluator:evaluator_user_id(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('period_start', { ascending: false })

  if (applicationName) query = query.eq('application_name', applicationName)

  const { data: scorecards, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ scorecards })
}

// Append-only, like performance_evaluations -- a formal periodic review of
// the application, not a task log. No PATCH/DELETE; corrections are a new
// scorecard.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !PRIVILEGED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await request.json()
  const { application_name, period, period_start, period_end, comments } = body

  if (!period || !period_start || !period_end) {
    return NextResponse.json({ error: 'period, period_start, and period_end are required' }, { status: 400 })
  }
  if (period_start > period_end) {
    return NextResponse.json({ error: 'period_start must be on or before period_end' }, { status: 400 })
  }

  const scores: Record<CategoryKey, number> = {} as Record<CategoryKey, number>
  for (const key of Object.keys(CATEGORY_WEIGHTS) as CategoryKey[]) {
    const value = Number(body[key])
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json({ error: `${key} must be a number between 0 and 100` }, { status: 400 })
    }
    scores[key] = value
  }

  const totalScore = Math.round(
    (Object.keys(CATEGORY_WEIGHTS) as CategoryKey[]).reduce(
      (sum, key) => sum + scores[key] * CATEGORY_WEIGHTS[key],
      0
    ) * 100
  ) / 100

  const { data: scorecard, error } = await supabaseAdmin
    .from('app_evaluation_scorecards')
    .insert({
      tenant_id: profile.tenant_id,
      application_name: application_name || 'August',
      period,
      period_start,
      period_end,
      evaluator_user_id: user.id,
      ...scores,
      total_score: totalScore,
      comments: comments || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ scorecard })
}
