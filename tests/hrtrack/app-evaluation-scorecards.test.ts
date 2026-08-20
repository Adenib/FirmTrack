import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, createTestUser, type TestTenant } from '../helpers/test-client'

describe('HRTrack Evaluate Applications: Weighted Scorecard', () => {
  let tenant: TestTenant
  let staffUser: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('AppEvalScorecard')
    staffUser = await createTestUser(tenant, { role: 'staff' })
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  const baseScorecard = {
    application_name: 'August',
    period: 'Q3 2026',
    period_start: '2026-07-01',
    period_end: '2026-09-30',
    legal_accuracy: 90,
    legal_research_citations: 85,
    drafting_quality: 80,
    document_review_analysis: 70,
    productivity_time_savings: 60,
    usability_ux: 75,
    security_confidentiality: 95,
    workflow_integration: 65,
    reliability_performance: 88,
    cost_roi_scalability: 72,
    comments: 'Solid quarter',
  }

  it('rejects a non-privileged user (plain staff role)', async () => {
    const res = await staffUser.fetch('/api/hrtrack/app-evaluation-scorecards', {
      method: 'POST',
      body: JSON.stringify(baseScorecard),
    })
    expect(res.status).toBe(403)
  })

  it('computes total_score server-side from the hardcoded weights, ignoring any client-sent total', async () => {
    const res = await tenant.fetch('/api/hrtrack/app-evaluation-scorecards', {
      method: 'POST',
      body: JSON.stringify({ ...baseScorecard, total_score: 1 }),
    })
    expect(res.status).toBe(200)
    const { scorecard } = await res.json()

    const expected =
      90 * 0.20 + 85 * 0.15 + 80 * 0.15 + 70 * 0.10 + 60 * 0.10 +
      75 * 0.10 + 95 * 0.10 + 65 * 0.05 + 88 * 0.025 + 72 * 0.025
    expect(Number(scorecard.total_score)).toBeCloseTo(expected, 2)
    expect(scorecard.evaluator_user_id).toBeTruthy()
  })

  it('rejects a category score outside 0-100', async () => {
    const res = await tenant.fetch('/api/hrtrack/app-evaluation-scorecards', {
      method: 'POST',
      body: JSON.stringify({ ...baseScorecard, legal_accuracy: 150 }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects period_start after period_end', async () => {
    const res = await tenant.fetch('/api/hrtrack/app-evaluation-scorecards', {
      method: 'POST',
      body: JSON.stringify({ ...baseScorecard, period_start: '2026-09-30', period_end: '2026-07-01' }),
    })
    expect(res.status).toBe(400)
  })

  it('has no PATCH/DELETE handler -- append-only, like performance_evaluations', async () => {
    const createRes = await tenant.fetch('/api/hrtrack/app-evaluation-scorecards', {
      method: 'POST',
      body: JSON.stringify(baseScorecard),
    })
    const { scorecard } = await createRes.json()

    const patchRes = await tenant.fetch('/api/hrtrack/app-evaluation-scorecards', {
      method: 'PATCH',
      body: JSON.stringify({ id: scorecard.id, legal_accuracy: 1 }),
    })
    expect(patchRes.status).toBe(405)

    const deleteRes = await tenant.fetch(`/api/hrtrack/app-evaluation-scorecards?id=${scorecard.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(405)
  })

  it('is readable tenant-wide, including by a non-privileged staff user', async () => {
    const res = await staffUser.fetch('/api/hrtrack/app-evaluation-scorecards')
    expect(res.status).toBe(200)
    const { scorecards } = await res.json()
    expect(scorecards.length).toBeGreaterThan(0)
  })
})
