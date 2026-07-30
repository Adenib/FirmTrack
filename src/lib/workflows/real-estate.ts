import type { WorkflowStage } from './types'

// Unlike Debt Recovery/Employment Law/Tax Advisory/Banking & Finance,
// the user's own spec for this template has an explicit "Matter
// Closed" terminal stage (same as Litigation) rather than ending at a
// real-world action -- straight linear sequence, no optional stage.
export const REAL_ESTATE_STAGES: WorkflowStage[] = [
  {
    key: 'client_request',
    label: 'Client Request',
    tasks: ['Log client\'s real estate request', 'Clarify scope of transaction (purchase, sale, or lease)'],
  },
  {
    key: 'property_search',
    label: 'Property Search',
    tasks: ['Conduct property search', 'Identify candidate properties or parcels'],
    notify: ['client'],
  },
  {
    key: 'title_verification',
    label: 'Title Verification',
    tasks: ['Verify title at land registry', 'Complete land registry checklist'],
    notify: ['team'],
  },
  {
    key: 'due_diligence',
    label: 'Due Diligence',
    tasks: ['Request required documents from parties', 'Track required documents checklist'],
    notify: ['team'],
  },
  {
    key: 'contract_drafting',
    label: 'Contract Drafting',
    tasks: ['Draft sale/purchase agreement', 'Calculate applicable stamp duty'],
    notify: ['team'],
  },
  {
    key: 'execution',
    label: 'Execution',
    tasks: ['Circulate contract for execution', 'Confirm all parties have executed'],
    notify: ['team', 'client'],
  },
  {
    key: 'government_registration',
    label: 'Government Registration',
    tasks: ['Submit documents for government registration', 'Track registration status'],
    createDeadline: { label: 'Registration follow-up', daysFromNow: 14 },
    notify: ['team'],
  },
  {
    key: 'payment_confirmation',
    label: 'Payment Confirmation',
    tasks: ['Confirm payment received or completed', 'Record disbursement of purchase price'],
    notify: ['client'],
  },
  {
    key: 'matter_closed',
    label: 'Matter Closed',
    tasks: ['Archive final registered documents', 'Final billing reconciliation'],
    notify: ['client'],
    closesMatter: true,
  },
]
