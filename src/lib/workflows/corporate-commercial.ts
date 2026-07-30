import type { WorkflowStage } from './types'

// "Matter Opened" and "Conflict Check" aren't tracked stages here, same
// reasoning as litigation.ts -- already satisfied atomically at
// matter-creation time. Tracking starts at KYC.
export const CORPORATE_COMMERCIAL_STAGES: WorkflowStage[] = [
  {
    key: 'kyc',
    label: 'KYC',
    tasks: ['Collect client KYC/ID and beneficial-ownership documents', 'Verify company registration documents'],
  },
  {
    key: 'engagement_letter',
    label: 'Engagement Letter',
    tasks: ['Draft engagement letter', 'Send engagement letter to client for signature'],
    notify: ['client'],
  },
  {
    key: 'due_diligence',
    label: 'Due Diligence',
    tasks: ['Request due diligence documents from client', 'Complete due diligence checklist'],
    notify: ['team'],
  },
  {
    key: 'document_review',
    label: 'Document Review',
    tasks: ['Review due diligence documents', 'Flag outstanding issues'],
    notify: ['team'],
  },
  {
    key: 'draft_agreements',
    label: 'Draft Agreements',
    // "Version control" from the spec is already DocTrack's job (every
    // upload is a new version, never overwritten) -- this is a reminder
    // to actually use it, not a new versioning system.
    tasks: ['Draft transaction agreements', 'Upload drafts to DocTrack for version-controlled review'],
    notify: ['team'],
  },
  {
    key: 'client_review',
    label: 'Client Review',
    tasks: ['Send draft agreements to client for review'],
    notify: ['client'],
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    tasks: ['Track negotiation redlines', 'Circulate revised drafts', 'Obtain partner approval to proceed to execution'],
    notify: ['team'],
  },
  {
    key: 'execution',
    label: 'Execution',
    // E-signature integration was explicitly assessed as a third-party
    // vendor decision (DocuSign/Adobe Sign), out of scope for Phase 1 --
    // this task says so honestly rather than pretending it's automated.
    tasks: ['Circulate agreements for signature (no e-signature integration yet -- collect and upload signed copies manually)', 'Confirm all parties have executed'],
    notify: ['team', 'client'],
  },
  {
    key: 'closing',
    label: 'Closing',
    tasks: ['Complete closing checklist', 'Confirm closing conditions satisfied', 'Record any closing payment or fees'],
    createDeadline: { label: 'Closing date', daysFromNow: 7 },
    notify: ['team', 'client'],
  },
  {
    key: 'archive_matter',
    label: 'Archive Matter',
    tasks: ['Archive final signed documents in DocTrack', 'Final billing reconciliation'],
    notify: ['client'],
    closesMatter: true,
  },
]
