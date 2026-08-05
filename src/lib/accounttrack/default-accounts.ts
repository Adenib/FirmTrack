// The default chart-of-accounts rows seeded per tenant. Kept in sync by
// hand with the seed blocks in
// supabase/migrations/20260711090000_accounttrack_general_ledger.sql (the
// original 8) and supabase/migrations/20260723090000_hrtrack_payroll.sql
// (salaries_expense, payroll_liabilities) — migrations are pure SQL, so
// there's no shared import between the two; if you add/change an account
// here, mirror it there too.
export const DEFAULT_ACCOUNTS = [
  { key: 'operating_cash', code: '1000', name: 'Operating Cash', account_type: 'asset' },
  { key: 'trust_bank', code: '1010', name: 'Trust Bank Account', account_type: 'asset' },
  { key: 'accounts_receivable', code: '1100', name: 'Accounts Receivable', account_type: 'asset' },
  { key: 'client_costs_advanced', code: '1200', name: 'Costs Advanced to Clients', account_type: 'asset' },
  { key: 'trust_liability', code: '2000', name: 'Trust Liabilities (Client Funds Held)', account_type: 'liability' },
  { key: 'payroll_liabilities', code: '2020', name: 'Payroll Liabilities (Deductions Payable)', account_type: 'liability' },
  { key: 'retainer_liability', code: '2010', name: 'Retainer Liabilities (Unearned Fees Held)', account_type: 'liability' },
  { key: 'fees_earned', code: '4000', name: 'Fees Earned', account_type: 'revenue' },
  { key: 'retained_earnings', code: '3000', name: 'Retained Earnings', account_type: 'equity' },
  { key: 'salaries_expense', code: '5000', name: 'Salaries Expense', account_type: 'expense' },
  { key: 'fx_gain', code: '4010', name: 'Foreign Exchange Gain', account_type: 'revenue' },
  { key: 'fx_loss', code: '5010', name: 'Foreign Exchange Loss', account_type: 'expense' },
] as const

export type AccountKey = typeof DEFAULT_ACCOUNTS[number]['key']
