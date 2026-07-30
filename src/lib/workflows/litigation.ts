import type { WorkflowStage } from './types'

// "Matter Opened" and "Conflict Check" (the first two steps of the
// user's own spec) aren't tracked stages here -- this app already
// requires a confirmed conflict check before a matter can be created
// at all (enforced in POST /api/admin/matters), so both are satisfied
// atomically at matter-creation time. Tracking starts at the next step.
export const LITIGATION_STAGES: WorkflowStage[] = [
  {
    key: 'client_onboarding',
    label: 'Client Onboarding',
    tasks: ['Collect client KYC/ID documents', 'Set up client file'],
  },
  {
    key: 'engagement_letter',
    label: 'Engagement Letter',
    tasks: ['Draft engagement letter', 'Send engagement letter to client for signature'],
    notify: ['client'],
  },
  {
    key: 'retainer_payment',
    label: 'Retainer Payment',
    tasks: ['Confirm retainer payment received'],
    notify: ['client'],
  },
  {
    key: 'assign_legal_team',
    label: 'Assign Legal Team',
    tasks: ['Assign responsible and supporting lawyers'],
    notify: ['team'],
  },
  {
    key: 'create_matter_folder',
    label: 'Create Matter Folder',
    tasks: ['Set up DocTrack folder/category for this matter'],
  },
  {
    key: 'prepare_pleadings',
    label: 'Prepare Pleadings',
    tasks: ['Draft pleadings', 'Internal review of pleadings'],
    notify: ['team'],
  },
  {
    key: 'file_in_court',
    label: 'File in Court',
    tasks: ['File pleadings in court', 'Record filing fee as a disbursement'],
    createDeadline: { label: 'Court filing deadline', daysFromNow: 14 },
    notify: ['team'],
  },
  {
    key: 'court_appearance',
    label: 'Court Appearance',
    tasks: ['Prepare for hearing', 'Brief client on hearing outcome expectations'],
    createDeadline: { label: 'Court appearance', daysFromNow: 30 },
    notify: ['team', 'client'],
  },
  {
    key: 'judgment',
    label: 'Judgment',
    tasks: ['Record judgment outcome', 'Advise client of judgment'],
    notify: ['team', 'client'],
  },
  {
    key: 'appeal',
    label: 'Appeal',
    optional: true,
    tasks: ['Assess grounds for appeal', 'File notice of appeal'],
    createDeadline: { label: 'Appeal filing deadline', daysFromNow: 21 },
    notify: ['team'],
  },
  {
    key: 'matter_closed',
    label: 'Matter Closed',
    tasks: ['Final billing reconciliation', 'Archive matter documents'],
    notify: ['client'],
    closesMatter: true,
  },
]
