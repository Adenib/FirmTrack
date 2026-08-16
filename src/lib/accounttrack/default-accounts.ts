// The default chart-of-accounts rows seeded per tenant. Kept in sync by
// hand with the seed blocks in
// supabase/migrations/20260711090000_accounttrack_general_ledger.sql (the
// original 8) and supabase/migrations/20260723090000_hrtrack_payroll.sql
// (salaries_expense, payroll_liabilities) — migrations are pure SQL, so
// there's no shared import between the two; if you add/change an account
// here, mirror it there too.
//
// operating_cash/trust_bank are flagged is_cash_account: true here so
// every NEW tenant gets it set correctly at signup -- the
// 20260816090000_accounttrack_coa_cash_account_flag.sql migration's
// backfill only reached tenants that already existed when it ran.
//
// is_cash_account is set explicitly (true or false) on EVERY row here,
// never omitted -- a single multi-row Supabase/PostgREST insert uses one
// column list for the whole batch, so a row that omits a not-null column
// gets an explicit NULL for it (not the column's default), which violates
// the not-null constraint and fails the entire insert. Confirmed by
// hand: seeding failed silently for every new signup until this was
// uniform across all 14 rows.
export const DEFAULT_ACCOUNTS = [
  { key: 'operating_cash', code: '1000', name: 'Operating Cash', account_type: 'asset', is_cash_account: true },
  { key: 'trust_bank', code: '1010', name: 'Trust Bank Account', account_type: 'asset', is_cash_account: true },
  { key: 'accounts_receivable', code: '1100', name: 'Accounts Receivable', account_type: 'asset', is_cash_account: false },
  { key: 'client_costs_advanced', code: '1200', name: 'Costs Advanced to Clients', account_type: 'asset', is_cash_account: false },
  { key: 'trust_liability', code: '2000', name: 'Trust Liabilities (Client Funds Held)', account_type: 'liability', is_cash_account: false },
  { key: 'payroll_liabilities', code: '2020', name: 'Payroll Liabilities (Deductions Payable)', account_type: 'liability', is_cash_account: false },
  { key: 'retainer_liability', code: '2010', name: 'Retainer Liabilities (Unearned Fees Held)', account_type: 'liability', is_cash_account: false },
  { key: 'fees_earned', code: '4000', name: 'Fees Earned', account_type: 'revenue', is_cash_account: false },
  { key: 'retained_earnings', code: '3000', name: 'Retained Earnings', account_type: 'equity', is_cash_account: false },
  { key: 'salaries_expense', code: '5000', name: 'Salaries Expense', account_type: 'expense', is_cash_account: false },
  { key: 'fx_gain', code: '4010', name: 'Foreign Exchange Gain', account_type: 'revenue', is_cash_account: false },
  { key: 'fx_loss', code: '5010', name: 'Foreign Exchange Loss', account_type: 'expense', is_cash_account: false },
  { key: 'unrealized_fx_gain', code: '4020', name: 'Unrealized Foreign Exchange Gain', account_type: 'revenue', is_cash_account: false },
  { key: 'unrealized_fx_loss', code: '5020', name: 'Unrealized Foreign Exchange Loss', account_type: 'expense', is_cash_account: false },
] as const

export type AccountKey = typeof DEFAULT_ACCOUNTS[number]['key']
