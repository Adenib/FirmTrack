import type { WorkflowStage } from './types'

// Like Debt Recovery, the user's own spec starts at a distinct real
// event ("Employee Complaint") rather than "Matter Opened" -- stays as
// the first tracked stage.
//
// Unlike Litigation, the user didn't bracket "Appeal" as "(Optional)"
// here, but there's also no separate closing stage after it the way
// Litigation has "Matter Closed" after its own Appeal -- Appeal IS the
// last item in this diagram. Read literally, most matters end at
// Decision (an employee simply not appealing); a minority proceed to
// Appeal, which is then genuinely final. So both Decision and Appeal
// close the matter when entered -- whichever one a given matter
// actually reaches -- and Appeal is marked optional (skippable via a
// plain advance) so Decision is reachable as a real terminal stage on
// its own, not just a mandatory waypoint before Appeal.
export const EMPLOYMENT_LAW_STAGES: WorkflowStage[] = [
  {
    key: 'employee_complaint',
    label: 'Employee Complaint',
    tasks: ['Log employee complaint details', 'Assign case handler'],
  },
  {
    key: 'case_assessment',
    label: 'Case Assessment',
    tasks: ['Assess complaint validity and scope', 'Determine investigation approach'],
    notify: ['team'],
  },
  {
    key: 'internal_investigation',
    label: 'Internal Investigation',
    tasks: ['Complete investigation checklist', 'Build evidence repository for this case'],
    notify: ['team'],
  },
  {
    key: 'interviews',
    label: 'Interviews',
    tasks: ['Schedule interviews with relevant parties', 'Conduct and document interviews'],
    notify: ['team'],
  },
  {
    key: 'legal_opinion',
    label: 'Legal Opinion',
    tasks: ['Draft legal opinion on findings', 'Partner review of opinion'],
    notify: ['team'],
  },
  {
    key: 'disciplinary_hearing',
    label: 'Disciplinary Hearing',
    tasks: ['Schedule disciplinary hearing', 'Notify employee of hearing'],
    createDeadline: { label: 'Disciplinary hearing', daysFromNow: 14 },
    notify: ['team'],
  },
  {
    key: 'decision',
    label: 'Decision',
    tasks: ['Record disciplinary decision', 'Generate outcome report', 'Notify employee of decision'],
    notify: ['team'],
    closesMatter: true,
  },
  {
    key: 'appeal',
    label: 'Appeal',
    optional: true,
    tasks: ['Log appeal grounds', 'Schedule appeal review'],
    createDeadline: { label: 'Appeal review deadline', daysFromNow: 14 },
    notify: ['team'],
    closesMatter: true,
  },
]
