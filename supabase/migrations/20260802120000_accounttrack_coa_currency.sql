-- Multi-currency accounting, Phase 1, Workstream C1. NULL means
-- "denominated in the tenant's base_currency" -- correct for every
-- existing row (nothing multi-currency has happened yet). Only a
-- genuinely foreign-currency bank account (e.g. a real "GTB $ CARD
-- ACCOUNT") would ever set this. Schema + a picker on the account UI
-- only in this phase -- no GL logic reads it yet.
alter table public.chart_of_accounts add column if not exists currency text;
