import { LITIGATION_STAGES } from './litigation'
import { CORPORATE_COMMERCIAL_STAGES } from './corporate-commercial'
import { DEBT_RECOVERY_STAGES } from './debt-recovery'
import { EMPLOYMENT_LAW_STAGES } from './employment-law'
import { TAX_ADVISORY_STAGES } from './tax-advisory'
import { BANKING_FINANCE_STAGES } from './banking-finance'
import { REAL_ESTATE_STAGES } from './real-estate'
import { INTELLECTUAL_PROPERTY_STAGES } from './intellectual-property'
import { MERGERS_ACQUISITIONS_STAGES } from './mergers-acquisitions'
import type { WorkflowStage } from './types'

// This registers the last 2 of the user's original 8 practice-area
// templates (Intellectual Property, Mergers & Acquisitions) plus the
// earlier unplanned Banking & Finance addition -- all 8 originally
// spec'd templates are now covered. Any further practice area is still
// just a new stage file + one line here, no schema or engine change.
export const WORKFLOW_TEMPLATES: Record<string, WorkflowStage[]> = {
  litigation: LITIGATION_STAGES,
  corporate_commercial: CORPORATE_COMMERCIAL_STAGES,
  debt_recovery: DEBT_RECOVERY_STAGES,
  employment_law: EMPLOYMENT_LAW_STAGES,
  tax_advisory: TAX_ADVISORY_STAGES,
  banking_finance: BANKING_FINANCE_STAGES,
  real_estate: REAL_ESTATE_STAGES,
  intellectual_property: INTELLECTUAL_PROPERTY_STAGES,
  mergers_acquisitions: MERGERS_ACQUISITIONS_STAGES,
}

export const TEMPLATE_LABELS: Record<string, string> = {
  litigation: 'Litigation',
  corporate_commercial: 'Corporate Commercial',
  debt_recovery: 'Debt Recovery',
  employment_law: 'Employment Law',
  tax_advisory: 'Tax Advisory',
  banking_finance: 'Banking & Finance',
  real_estate: 'Real Estate',
  intellectual_property: 'Intellectual Property',
  mergers_acquisitions: 'Mergers & Acquisitions',
}

// Maps a matter's existing `law_type` field (already collected at
// matter-creation time, see LAW_TYPES in the New Matter form) to a
// registered workflow template -- lets the detail page suggest the
// right template without adding a new field.
// "Debt Recovery", "Banking & Finance", and "Mergers & Acquisitions"
// were not previously options in LAW_TYPES -- added there alongside
// their mappings since each is a distinct, common practice area with
// its own template.
const LAW_TYPE_TO_TEMPLATE: Record<string, string> = {
  Litigation: 'litigation',
  Corporate: 'corporate_commercial',
  'Debt Recovery': 'debt_recovery',
  Employment: 'employment_law',
  Tax: 'tax_advisory',
  'Banking & Finance': 'banking_finance',
  'Real Estate': 'real_estate',
  'Intellectual Property': 'intellectual_property',
  'Mergers & Acquisitions': 'mergers_acquisitions',
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
