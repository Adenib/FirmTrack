// Pure, no-I/O helpers for the repair-vs-replace guidance in AssetTrack's
// policy brief. Both are advisory only -- callers display the result, they
// never gate a decision on it (the brief itself calls these "proposed
// starting points," and FirmTrack has no role between "IT staff" and
// owner/admin to make a blocking 3-tier escalation meaningful).

export type LaptopAsset = {
  purchase_date: string | null
  warranty_end_date: string | null
}

export type LaptopClassification = 'warranty_active' | 'new' | 'old' | 'review_required'

const NEW_LAPTOP_MAX_AGE_YEARS = 3

export function classifyLaptop(asset: LaptopAsset, today: Date = new Date()): LaptopClassification {
  if (asset.warranty_end_date && new Date(`${asset.warranty_end_date}T23:59:59`) >= today) {
    return 'warranty_active'
  }

  if (!asset.purchase_date) return 'review_required'

  // Calendar-year comparison (not an average-day-length division) so a
  // laptop purchased exactly 3 years ago today still counts as "new,"
  // regardless of which years in between happened to be leap years.
  const newUntil = new Date(asset.purchase_date)
  newUntil.setFullYear(newUntil.getFullYear() + NEW_LAPTOP_MAX_AGE_YEARS)
  return today <= newUntil ? 'new' : 'old'
}

export type RepairCostRecommendation = 'repair_review' | 'manager_review' | 'replacement_review' | 'insufficient_data'

export type CostAssessment = {
  ratio: number | null
  recommendation: RepairCostRecommendation
}

const REPAIR_REVIEW_MAX_RATIO = 0.4
const MANAGER_REVIEW_MAX_RATIO = 0.6

export function assessRepairCost(
  repairCost: number | null | undefined,
  replacementCost: number | null | undefined
): CostAssessment {
  if (
    repairCost == null ||
    replacementCost == null ||
    !Number.isFinite(repairCost) ||
    !Number.isFinite(replacementCost) ||
    repairCost < 0 ||
    replacementCost <= 0
  ) {
    return { ratio: null, recommendation: 'insufficient_data' }
  }

  const ratio = repairCost / replacementCost

  if (ratio <= REPAIR_REVIEW_MAX_RATIO) return { ratio, recommendation: 'repair_review' }
  if (ratio <= MANAGER_REVIEW_MAX_RATIO) return { ratio, recommendation: 'manager_review' }
  return { ratio, recommendation: 'replacement_review' }
}
