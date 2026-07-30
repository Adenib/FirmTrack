import type { WorkflowStage } from './types'

// Like Debt Recovery/Employment Law, the user's own spec starts at a
// distinct real event ("Client Request") rather than "Matter Opened"
// -- stays as the first tracked stage. No optional/branching stage
// here (unlike Litigation/Debt Recovery/Employment Law) -- a straight
// linear sequence, same shape as Corporate Commercial.
export const TAX_ADVISORY_STAGES: WorkflowStage[] = [
  {
    key: 'client_request',
    label: 'Client Request',
    tasks: ['Log client\'s tax advisory request', 'Clarify scope of advice needed'],
  },
  {
    key: 'information_collection',
    label: 'Information Collection',
    tasks: ['Collect financial and tax documents from client', 'Confirm all information required for research is available'],
    notify: ['client'],
  },
  {
    key: 'research',
    label: 'Research',
    tasks: ['Conduct tax research using firm templates', 'Document research findings'],
    notify: ['team'],
  },
  {
    key: 'opinion_drafting',
    label: 'Opinion Drafting',
    tasks: ['Draft tax opinion', 'Save opinion draft to firm opinion repository'],
    notify: ['team'],
  },
  {
    key: 'partner_review',
    label: 'Partner Review',
    tasks: ['Route opinion to partner for review', 'Partner approves or requests revisions'],
    notify: ['team'],
  },
  {
    key: 'client_delivery',
    label: 'Client Delivery',
    tasks: ['Deliver final opinion to client'],
    notify: ['client'],
  },
  {
    key: 'implementation',
    label: 'Implementation',
    tasks: ['Support client with implementing the advice', 'Confirm implementation steps completed'],
    notify: ['client'],
  },
  {
    key: 'follow_up',
    label: 'Follow-up',
    tasks: ['Schedule follow-up check-in with client', 'Confirm no further action needed'],
    notify: ['client'],
    closesMatter: true,
  },
]
