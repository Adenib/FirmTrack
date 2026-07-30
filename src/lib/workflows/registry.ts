import { LITIGATION_STAGES } from './litigation'
import type { WorkflowStage } from './types'

// Adding a future practice-area template (Corporate Commercial, Debt
// Recovery, etc.) is a new stage file + one line here -- no schema or
// engine change needed.
export const WORKFLOW_TEMPLATES: Record<string, WorkflowStage[]> = {
  litigation: LITIGATION_STAGES,
}

export function getWorkflowStages(template: string): WorkflowStage[] | null {
  return WORKFLOW_TEMPLATES[template] || null
}

// Pure -- next stage after `currentStage` in `template`, skipping optional
// stages unless explicitly targeted via `toStage`. Returns null once past
// the last stage, or if currentStage/toStage isn't found in the template.
export function getNextStage(
  template: string,
  currentStage: string | null,
  toStage?: string
): WorkflowStage | null {
  const stages = getWorkflowStages(template)
  if (!stages) return null

  if (toStage) {
    return stages.find((s) => s.key === toStage) || null
  }

  if (currentStage === null) {
    return stages[0] || null
  }

  const currentIndex = stages.findIndex((s) => s.key === currentStage)
  if (currentIndex === -1) return null

  for (let i = currentIndex + 1; i < stages.length; i++) {
    if (!stages[i].optional) return stages[i]
  }
  return null
}
