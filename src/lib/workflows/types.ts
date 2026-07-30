export type WorkflowStage = {
  key: string
  label: string
  // Skipped by getNextStage unless explicitly targeted -- e.g. Appeal,
  // which most matters never enter.
  optional?: boolean
  tasks: string[]
  createDeadline?: { label: string; daysFromNow: number }
  notify?: ('team' | 'client')[]
  // Set when entering this stage should also close the matter out
  // (matters.status = 'closed'), rather than needing a separate action.
  closesMatter?: boolean
}
