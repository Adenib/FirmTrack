import type { WorkflowStage } from './types'

// The user's spec ends at "Renewal Reminders" rather than a distinct
// "Matter Closed" stage -- trademark prosecution genuinely continues
// into long-term renewal monitoring rather than a one-time close. Still
// marked closesMatter here (matters.status is a reporting label, not a
// hard gate -- see Tax Advisory's Follow-up and Banking & Finance's
// Post-Completion for the same shape), with a ~10-year renewal
// deadline reflecting the real trademark renewal cycle.
export const INTELLECTUAL_PROPERTY_STAGES: WorkflowStage[] = [
  {
    key: 'trademark_request',
    label: 'Trademark Request',
    tasks: ['Log trademark request details', 'Confirm mark and classes to be registered'],
  },
  {
    key: 'availability_search',
    label: 'Availability Search',
    tasks: ['Conduct trademark availability search', 'Document search results'],
    notify: ['team'],
  },
  {
    key: 'client_approval',
    label: 'Client Approval',
    tasks: ['Present search results to client', 'Obtain client approval to proceed with filing'],
    notify: ['client'],
  },
  {
    key: 'application_filing',
    label: 'Application Filing',
    tasks: ['File trademark application', 'Record filing reference number'],
    notify: ['team'],
  },
  {
    key: 'publication',
    label: 'Publication',
    tasks: ['Monitor publication in official gazette', 'Notify client of publication'],
    notify: ['client'],
  },
  {
    key: 'opposition_period',
    label: 'Opposition Period',
    tasks: ['Monitor opposition period', 'Respond to any opposition filed'],
    createDeadline: { label: 'Opposition period ends', daysFromNow: 90 },
    notify: ['team'],
  },
  {
    key: 'registration',
    label: 'Registration',
    tasks: ['Confirm registration granted', 'Store registration certificate in DocTrack'],
    notify: ['client'],
  },
  {
    key: 'renewal_reminders',
    label: 'Renewal Reminders',
    tasks: ['Set up trademark renewal reminder', 'Confirm renewal monitoring is in place'],
    createDeadline: { label: 'Trademark renewal due', daysFromNow: 3650 },
    notify: ['client'],
    closesMatter: true,
  },
]
