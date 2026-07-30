import type { WorkflowStage } from './types'

// Linear, no optional stage. "Virtual data room integration" and
// "Document version control" from the user's automation list are both
// third-party-vendor / already-covered-by-DocTrack territory (same
// class of honest deferral as Corporate Commercial's e-signature note)
// -- tasks reference using DocTrack's existing version history rather
// than claiming a new data-room integration that doesn't exist.
export const MERGERS_ACQUISITIONS_STAGES: WorkflowStage[] = [
  {
    key: 'client_engagement',
    label: 'Client Engagement',
    tasks: ['Confirm client\'s instruction and deal parameters', 'Record key deal terms'],
  },
  {
    key: 'nda',
    label: 'NDA',
    tasks: ['Draft and circulate NDA', 'Confirm NDA executed by all parties'],
    notify: ['client'],
  },
  {
    key: 'due_diligence',
    label: 'Due Diligence',
    tasks: ['Set up due diligence tracker', 'Request due diligence documents (upload to DocTrack in lieu of a data room)'],
    notify: ['team'],
  },
  {
    key: 'risk_report',
    label: 'Risk Report',
    tasks: ['Draft due diligence risk report', 'Partner review of risk report'],
    notify: ['team'],
  },
  {
    key: 'spa_drafting',
    label: 'SPA Drafting',
    tasks: ['Draft share purchase agreement (SPA)', 'Assign drafting tasks by workstream'],
    notify: ['team'],
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    tasks: ['Track negotiation redlines', 'Circulate revised drafts via DocTrack version history'],
    notify: ['team'],
  },
  {
    key: 'signing',
    label: 'Signing',
    tasks: ['Circulate SPA for signature', 'Confirm all parties have signed'],
    notify: ['team', 'client'],
  },
  {
    key: 'closing',
    label: 'Closing',
    tasks: ['Complete closing checklist', 'Confirm closing conditions satisfied'],
    createDeadline: { label: 'Closing date', daysFromNow: 7 },
    notify: ['team', 'client'],
  },
  {
    key: 'post_closing_obligations',
    label: 'Post-Closing Obligations',
    tasks: ['Track post-closing obligations', 'Final billing reconciliation'],
    notify: ['client'],
    closesMatter: true,
  },
]
