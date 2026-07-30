import { LITIGATION_STAGES } from './litigation'
import { CORPORATE_COMMERCIAL_STAGES } from './corporate-commercial'
import { DEBT_RECOVERY_STAGES } from './debt-recovery'
import { EMPLOYMENT_LAW_STAGES } from './employment-law'
import { TAX_ADVISORY_STAGES } from './tax-advisory'
import { BANKING_FINANCE_STAGES } from './banking-finance'
import type { WorkflowStage } from './types'

// Adding a future practice-area template (Real Estate, IP, etc.) is a
// new stage file + one line here -- no schema or engine change needed.
export const WORKFLOW_TEMPLATES: Record<string, WorkflowStage[]> = {
  litigation: LITIGATION_STAGES,
  corporate_commercial: CORPORATE_COMMERCIAL_STAGES,
  debt_recovery: DEBT_RECOVERY_STAGES,
  employment_law: EMPLOYMENT_LAW_STAGES,
  tax_advisory: TAX_ADVISORY_STAGES,
  banking_finance: BANKING_FINANCE_STAGES,
}

export const TEMPLATE_LABELS: Record<string, string> = {
  litigation: 'Litigation',
  corporate_commercial: 'Corporate Commercial',
  debt_recovery: 'Debt Recovery',
  employment_law: 'Employment Law',
  tax_advisory: 'Tax Advisory',
  banking_finance: 'Banking & Finance',
}

// Maps a matter's existing `law_type` field (already collected at
// matter-creation time, see LAW_TYPES in the New Matter form) to a
// registered workflow template -- lets the detail page suggest the
// right template without adding a new field. Practice areas with no
// template yet (Real Estate, IP, ...) resolve to null.
// "Debt Recovery" and "Banking & Finance" were not previously options
// in LAW_TYPES -- added there alongside their mappings since each is a
// distinct, common practice area with its own template.
const LAW_TYPE_TO_TEMPLATE: Record<string, string> = {
  Litigation: 'litigation',
  Corporate: 'corporate_commercial',
  'Debt Recovery': 'debt_recovery',
  Employment: 'employment_law',
  Tax: 'tax_advisory',
  'Banking & Finance': 'banking_finance',
}

export function getTemplateForLawType(lawType: string | null): string | null {
  if (!lawType) return null
  return LAW_TYPE_TO_TEMPLATE[lawType] || null
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
