import { TIER_PRICES, ADDON_PRICE_BASIC } from '@/lib/billing/pricing'

export type FaqEntry = {
  id: string
  question: string
  keywords: string[]
  answer: string
}

export type FaqCategory = {
  id: string
  label: string
  entries: FaqEntry[]
}

const GETTING_STARTED: FaqCategory = {
  id: 'getting-started',
  label: 'Getting Started',
  entries: [
    {
      id: 'getting-started',
      question: 'How do I get started?',
      keywords: ['start', 'trial', 'sign up', 'signup', 'register', 'demo', 'begin'],
      answer:
        'Click "Get started free" to create your firm\'s account in minutes -- no credit card required for the free modules. If you\'d rather see it walked through first, click "Book a demo" and we\'ll set up time with you.',
    },
  ],
}

const PRICING: FaqCategory = {
  id: 'pricing',
  label: 'Pricing',
  entries: [
    {
      id: 'pricing',
      question: 'How much does FirmTrack cost?',
      keywords: ['price', 'pricing', 'cost', 'plan', 'plans', 'tier', 'subscription'],
      answer:
        `FirmTrack has three tiers: Basic (from ₦${TIER_PRICES.basic.toLocaleString()}/user/month, ` +
        `with AccountTrack, DocTrack, HRTrack, and AI Support available as ₦${ADDON_PRICE_BASIC.toLocaleString()}/user/month add-ons), ` +
        `Standard (₦${TIER_PRICES.standard.toLocaleString()}/user/month, every module included), and ` +
        `Elite (₦${TIER_PRICES.elite.toLocaleString()}/user/month, every module included). ` +
        `Several modules -- TimeTrack, BillTrack, and HRTrack's task/movement tools -- are free to start with. ` +
        `The best way to see an exact number for your firm is the "Get started free" button below, or book a demo.`,
    },
  ],
}

const TIMETRACK: FaqCategory = {
  id: 'timetrack',
  label: 'TimeTrack',
  entries: [
    {
      id: 'timetrack-overview',
      question: 'What does TimeTrack do?',
      keywords: ['timetrack', 'time tracking'],
      answer:
        'Every billable minute, captured without the busywork. Log time against any matter, generate firmwide activity reports, and see exactly what each lawyer and matter is spending time on.',
    },
    {
      id: 'timetrack-capture',
      question: 'How does time capture actually work?',
      keywords: ['log time', 'billable', 'time entry', 'timesheet'],
      answer:
        'Log billable or non-billable time against any matter, with a rate and hours or a flat amount. "Quick Fee" is a fast-entry mode for simple flat-fee work. Saved entries for a matter roll up into a Matter Summary Card showing billable hours, non-billable hours, total hours, and total amount at a glance.',
    },
    {
      id: 'timetrack-desktop-agent',
      question: "What's the TimeTrack desktop agent?",
      keywords: ['desktop agent', 'auto track', 'automatic', 'electron'],
      answer:
        'An optional small background app for Windows/Mac that watches which app/window is active and logs the time automatically, which you then review and convert into real time entries -- so nothing billable slips through the cracks. The same app also powers HRTrack\'s work-from-home activity monitoring, since both need to know when a device has actually been idle.',
    },
  ],
}

const BILLTRACK: FaqCategory = {
  id: 'billtrack',
  label: 'BillTrack',
  entries: [
    {
      id: 'billtrack-overview',
      question: 'What does BillTrack do?',
      keywords: ['billtrack', 'invoicing', 'billing'],
      answer: 'Turn tracked time and disbursements into invoices your clients actually pay, with automated follow-up so nothing goes stale unpaid.',
    },
    {
      id: 'billtrack-invoicing',
      question: 'How does invoicing work in BillTrack?',
      keywords: ['invoice', 'invoices', 'generate invoice'],
      answer:
        'Select a matter\'s unbilled time entries and disbursements and generate one itemized invoice covering fees, disbursements, the total, and what\'s been paid so far. Invoices can be billed in a client\'s own currency, with the exchange-rate conversion handled automatically.',
    },
    {
      id: 'billtrack-reminders',
      question: 'How do payment reminders work?',
      keywords: ['reminder', 'reminders', 'overdue', 'follow up'],
      answer:
        'Each invoice gets automated payment reminders on a configurable cadence, which you can pause or resume per invoice if you\'re handling collection personally. A firmwide report shows every outstanding balance at a glance.',
    },
  ],
}

const ACCOUNTTRACK: FaqCategory = {
  id: 'accounttrack',
  label: 'AccountTrack',
  entries: [
    {
      id: 'accounttrack-overview',
      question: 'What does AccountTrack do?',
      keywords: ['accounttrack', 'accounting'],
      answer: 'Real double-entry accounting, built for legal practice -- not a bolt-on spreadsheet.',
    },
    {
      id: 'accounttrack-ledger',
      question: 'How does the general ledger work?',
      keywords: ['ledger', 'chart of accounts', 'journal', 'double entry', 'double-entry'],
      answer:
        'Every action in AccountTrack -- an invoice, a payment, a disbursement -- posts a real, balanced debit-and-credit journal entry to a full chart of accounts automatically. Financial statements (Income Statement, Balance Sheet) are computed live from that ledger, not maintained separately.',
    },
    {
      id: 'accounttrack-trust',
      question: 'How does trust accounting work?',
      keywords: ['trust', 'retainer', 'client funds'],
      answer:
        'Trust and retainer ledgers track client funds separately from the firm\'s own operating money, with a running balance for every deposit and withdrawal -- matching how legal trust accounting actually has to work, not treating client money like ordinary revenue.',
    },
    {
      id: 'accounttrack-multicurrency',
      question: 'Does AccountTrack support multiple currencies?',
      keywords: ['currency', 'currencies', 'foreign exchange', 'fx', 'usd', 'multi-currency'],
      answer:
        'Yes. Bill a client in a foreign currency with real exchange-rate conversion; when a foreign-currency invoice is paid at a different rate than it was issued, the realized gain or loss is booked automatically. If you hold an actual foreign-currency bank account, it can be revalued at period end for unrealized FX gain/loss, and financial statements have a "view in currency" toggle for quick reference.',
    },
    {
      id: 'accounttrack-periods',
      question: 'Can I close the books for a period?',
      keywords: ['close books', 'period close', 'year end', 'year-end'],
      answer:
        'Yes -- accounting period close/reopen controls, with an automatic year-end closing entry that zeroes revenue and expense accounts into retained earnings. Reopening a period reverses that entry cleanly rather than editing history.',
    },
  ],
}

const DOCTRACK: FaqCategory = {
  id: 'doctrack',
  label: 'DocTrack',
  entries: [
    {
      id: 'doctrack-overview',
      question: 'What does DocTrack do?',
      keywords: ['doctrack', 'documents'],
      answer: 'Matter-linked document storage your firm can trust, with a complete audit trail of every action taken on a file.',
    },
    {
      id: 'doctrack-storage',
      question: 'How does document storage work?',
      keywords: ['storage', 'version', 'versions', 'audit trail'],
      answer:
        'Documents are linked to a specific matter, with full version history and a complete audit trail of every upload, download, and edit. Access is role-based, down to the individual matter -- someone without access to a matter can\'t see its documents.',
    },
    {
      id: 'doctrack-microsoft',
      question: 'Can I link files from OneDrive or SharePoint instead of uploading them?',
      keywords: ['onedrive', 'sharepoint', 'outlook', 'microsoft', 'link file'],
      answer:
        'Yes -- link a file directly from OneDrive, an Outlook email, or a SharePoint site without making a duplicate copy; FirmTrack stores a reference to the original. Each person connects their own Microsoft account individually, so this respects whatever access they already have in your Microsoft 365 tenant.',
    },
    {
      id: 'doctrack-retention',
      question: 'How long are documents retained?',
      keywords: ['retention', 'delete', 'archive'],
      answer: 'Document retention policies are configurable per firm, so you can match whatever record-keeping rules apply to your practice.',
    },
  ],
}

const HRTRACK: FaqCategory = {
  id: 'hrtrack',
  label: 'HRTrack',
  entries: [
    {
      id: 'hrtrack-overview',
      question: 'What does HRTrack do?',
      keywords: ['hrtrack', 'hr', 'human resources'],
      answer: 'Attendance, leave, staff tasks, performance, and payroll, all in one place -- with a dedicated HR role to manage it.',
    },
    {
      id: 'hrtrack-attendance',
      question: 'How does attendance tracking work?',
      keywords: ['attendance', 'clock in', 'clock out', 'office', 'remote'],
      answer:
        'Staff clock in and out with GPS, and each clock-in is automatically tagged office or remote based on your configured office locations and a geofence radius -- no manual selection needed.',
    },
    {
      id: 'hrtrack-wfh',
      question: 'What is work-from-home activity monitoring?',
      keywords: ['work from home', 'wfh', 'idle', 'activity monitoring'],
      answer:
        'For anyone clocked in remote, the desktop agent watches for 30 minutes of inactivity and prompts "Are you still working from home?" If there\'s no response, that\'s recorded, and an end-of-day digest lists anyone who went unconfirmed that day, sent to HR, admins, and owners. It also shows live on the Attendance page, not just in the daily email.',
    },
    {
      id: 'hrtrack-leave',
      question: 'How do leave requests work?',
      keywords: ['leave', 'redeployment', 'grievance', 'exit', 'approval'],
      answer: 'Leave, redeployment, grievance, and exit requests all go through a proper approval workflow, so nothing gets actioned informally.',
    },
    {
      id: 'hrtrack-payroll',
      question: 'How does payroll work?',
      keywords: ['payroll', 'payslip', 'salary'],
      answer: 'Run payroll and payslips are generated automatically for each staff member and emailed out, with salaries and deductions tracked per person.',
    },
    {
      id: 'hrtrack-tasks-movement',
      question: 'Does HRTrack track internal tasks and staff movement?',
      keywords: ['task', 'tasks', 'movement', 'to-do', 'todo', 'travel'],
      answer:
        'Yes, both are part of HRTrack. An internal task system lets staff be assigned work with a priority and due date, with manager approval required to mark a task fully done. A staff movement log records trips out of the office (e.g. "attending court in Ikeja") which also goes through manager approval.',
    },
  ],
}

const CALENTRACK: FaqCategory = {
  id: 'calentrack',
  label: 'CalenTrack',
  entries: [
    {
      id: 'calentrack-overview',
      question: 'What does CalenTrack do?',
      keywords: ['calentrack', 'calendar'],
      answer: 'A shared firm calendar so deadlines and appointments never fall through the cracks, with its own reporting.',
    },
    {
      id: 'calentrack-linking',
      question: 'Can calendar events be linked to a matter?',
      keywords: ['event', 'events', 'link matter', 'deadline'],
      answer: 'Yes, optionally -- an event can be tied to a specific matter, or left unlinked for general firm scheduling.',
    },
  ],
}

const ADMIN: FaqCategory = {
  id: 'admin',
  label: 'Admin',
  entries: [
    {
      id: 'admin-overview',
      question: 'What does Admin cover?',
      keywords: ['admin', 'administration'],
      answer: 'Full control over your firm, its people, and its security -- users, lawyers, clients, matters, and every access control in one place.',
    },
    {
      id: 'admin-conflict',
      question: 'How are conflict-of-interest checks handled?',
      keywords: ['conflict', 'conflict of interest', 'conflict check'],
      answer: 'Opening a new matter requires a documented conflict-of-interest search first -- it\'s a required step in matter creation, not an afterthought.',
    },
    {
      id: 'admin-security',
      question: 'What security controls does Admin give me?',
      keywords: ['role', 'roles', 'permission', 'permissions', 'backup', 'restore'],
      answer:
        'User roles and permissions (owner, admin, manager, accounts, hr, staff), a full security audit log, multi-factor authentication enforcement, and a complete data backup with the ability to restore into a brand-new organization if you ever needed to.',
    },
  ],
}

const AI_SUPPORT: FaqCategory = {
  id: 'ai-support',
  label: 'AI Support Assistant',
  entries: [
    {
      id: 'ai-support-overview',
      question: "What's the AI Support Assistant?",
      keywords: ['ai support', 'ai assistant', 'chatbot', 'chat support'],
      answer:
        'An optional add-on that puts an AI chat option right in your support requests for instant answers, alongside the standard human-reply channel -- a real person is always available as a fallback via support@firmtracks.com.',
    },
  ],
}

const SECURITY: FaqCategory = {
  id: 'security',
  label: 'Security',
  entries: [
    {
      id: 'security',
      question: 'Is FirmTrack secure?',
      keywords: ['security', 'secure', 'safe', 'mfa', 'encryption', 'data', 'privacy'],
      answer:
        'Yes -- multi-factor authentication, full security audit logging, the ability to sign out every device at once, encryption in transit, and strict tenant data isolation between firms. See our Security Guaranty for the full detail.',
    },
  ],
}

const SUPPORT: FaqCategory = {
  id: 'support',
  label: 'Support',
  entries: [
    {
      id: 'support',
      question: 'What if I need help after signing up?',
      keywords: ['support', 'help', 'contact', 'assistance'],
      answer:
        'Every plan includes support via support@firmtracks.com with a reply within 24 hours. Once you\'re signed in, you can also open a support request directly from the app -- with the optional AI Assistant for instant answers.',
    },
  ],
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  GETTING_STARTED,
  PRICING,
  TIMETRACK,
  BILLTRACK,
  ACCOUNTTRACK,
  DOCTRACK,
  HRTRACK,
  CALENTRACK,
  ADMIN,
  AI_SUPPORT,
  SECURITY,
  SUPPORT,
]

export const FAQ_ENTRIES: FaqEntry[] = FAQ_CATEGORIES.flatMap((c) => c.entries)

// Plain substring matching against each entry's keywords/question --
// intentionally not AI/NLP, so this has zero per-query cost and nothing to
// prompt-inject. Returns the first match; null means "show the fallback".
export function matchFaqEntry(query: string): FaqEntry | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return (
    FAQ_ENTRIES.find(
      (entry) =>
        entry.keywords.some((k) => q.includes(k)) || entry.question.toLowerCase().includes(q)
    ) || null
  )
}
