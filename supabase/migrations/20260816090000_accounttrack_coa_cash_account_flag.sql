-- Lets a tenant flag a chart-of-accounts row as a selectable cash/bank
-- account (Operating Cash, Trust Bank, or a custom one like "Petty Cash -
-- Lagos"). Backing the new General Check / Receive Payment account
-- selectors -- previously nothing distinguished a cash/bank asset account
-- from any other asset account (e.g. Accounts Receivable).
alter table public.chart_of_accounts add column if not exists is_cash_account boolean not null default false;

update public.chart_of_accounts set is_cash_account = true where key in ('operating_cash', 'trust_bank');
