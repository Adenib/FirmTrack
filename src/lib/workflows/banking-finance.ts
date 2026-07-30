import type { WorkflowStage } from './types'

// Banking & Finance wasn't one of the 8 templates the user originally
// spec'd out with a stage diagram -- it was only named in the broader
// future-template list. Designed from scratch (confirmed with the
// user before building) to match the shape of the shipped templates:
// a straight linear sequence, no optional stage, same as Corporate
// Commercial and Tax Advisory.
export const BANKING_FINANCE_STAGES: WorkflowStage[] = [
  {
    key: 'client_engagement',
    label: 'Client Engagement',
    tasks: ['Confirm client\'s instruction and facility requirements', 'Record key facility terms (amount, tenor, purpose)'],
  },
  {
    key: 'term_sheet_review',
    label: 'Term Sheet Review',
    tasks: ['Review term sheet', 'Flag key commercial terms for negotiation'],
    notify: ['team'],
  },
  {
    key: 'due_diligence',
    label: 'Due Diligence',
    tasks: ['Request due diligence documents from borrower', 'Complete due diligence checklist'],
    notify: ['team'],
  },
  {
    key: 'facility_agreement_drafting',
    label: 'Facility Agreement Drafting',
    tasks: ['Draft facility agreement', 'Circulate draft for internal review'],
    notify: ['team'],
  },
  {
    key: 'security_documentation',
    label: 'Security Documentation',
    tasks: ['Draft security and collateral documents', 'Identify required security perfection steps'],
    notify: ['team'],
  },
  {
    key: 'regulatory_compliance_check',
    label: 'Regulatory & Compliance Check',
    tasks: ['Complete KYC/AML checks', 'Confirm regulatory approvals required and obtained'],
    notify: ['team'],
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    tasks: ['Track negotiation redlines with counterparty', 'Circulate revised drafts'],
    notify: ['client'],
  },
  {
    key: 'conditions_precedent',
    label: 'Conditions Precedent',
    tasks: ['Track conditions precedent checklist', 'Confirm all conditions precedent satisfied'],
    notify: ['team', 'client'],
  },
  {
    key: 'execution_drawdown',
    label: 'Execution & Drawdown',
    tasks: ['Circulate documents for execution', 'Confirm drawdown conditions met and process drawdown'],
    createDeadline: { label: 'Drawdown date', daysFromNow: 7 },
    notify: ['team', 'client'],
  },
  {
    key: 'post_completion',
    label: 'Post-Completion',
    tasks: ['Complete security perfection filings', 'Set up facility and covenant monitoring reminders'],
    notify: ['client'],
    closesMatter: true,
  },
]
