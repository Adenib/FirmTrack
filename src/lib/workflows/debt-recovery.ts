import type { WorkflowStage } from './types'

// Unlike litigation/corporate-commercial, the user's own spec for this
// template starts at "Client Instruction" rather than "Matter Opened"
// -- that's a distinct real event (the client formally instructing the
// firm to pursue recovery), not a synonym for matter-creation, so it
// stays as the first tracked stage rather than being skipped.
//
// Only "Litigation" is optional, matching the single "(if required)"
// the user annotated in their own diagram -- Judgment and Enforcement
// are not independently skippable. A matter that settles simply stops
// advancing at "settlement" (mark it complete via the ordinary status
// field); a matter that needs to litigate uses the generic "go to the
// next optional stage" button to enter it, after which Judgment and
// Enforcement follow normally.
export const DEBT_RECOVERY_STAGES: WorkflowStage[] = [
  {
    key: 'client_instruction',
    label: 'Client Instruction',
    tasks: ['Confirm client\'s instruction to pursue recovery', 'Record debt amount and details'],
  },
  {
    key: 'demand_letter',
    label: 'Demand Letter',
    tasks: ['Draft demand letter using template', 'Send demand letter to debtor'],
    notify: ['client'],
  },
  {
    key: 'payment_reminder',
    label: 'Payment Reminder',
    tasks: ['Send payment reminder to debtor', 'Calculate accrued interest on outstanding debt'],
    createDeadline: { label: 'Payment reminder follow-up', daysFromNow: 14 },
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    tasks: ['Track negotiation correspondence with debtor', 'Update client on negotiation progress'],
    notify: ['client'],
  },
  {
    key: 'settlement',
    label: 'Settlement',
    tasks: ['Record settlement terms', 'Track settlement payment schedule'],
    notify: ['team', 'client'],
  },
  {
    key: 'litigation',
    label: 'Litigation',
    optional: true,
    tasks: ['Assign lawyers to file suit', 'Prepare and file claim'],
    createDeadline: { label: 'Court filing deadline', daysFromNow: 14 },
    notify: ['team'],
  },
  {
    key: 'judgment',
    label: 'Judgment',
    tasks: ['Record judgment outcome', 'Advise client of judgment'],
    notify: ['team', 'client'],
  },
  {
    key: 'enforcement',
    label: 'Enforcement',
    tasks: ['Initiate enforcement proceedings', 'Generate collection report for client'],
    notify: ['client'],
    closesMatter: true,
  },
]
