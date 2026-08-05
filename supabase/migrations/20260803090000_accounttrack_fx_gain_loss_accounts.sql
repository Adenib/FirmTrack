-- Multi-currency accounting, Phase 2, Workstream D. Two new default
-- accounts for realized FX gain/loss on foreign-currency invoice
-- payments -- separate accounts (not one shared account) so each
-- always shows a positive number, per the confirmed design. Seeded for
-- every *existing* tenant here, matching the exact pattern
-- 20260723090000_hrtrack_payroll.sql used for salaries_expense/
-- payroll_liabilities; kept in sync by hand with
-- src/lib/accounttrack/default-accounts.ts for new tenants going
-- forward. Codes 4010/5010 confirmed via a live query to not collide
-- with any existing tenant's custom account codes (including AELEX
-- PARTNERS' 747 real imported accounts) before writing this.
insert into public.chart_of_accounts (tenant_id, key, code, name, account_type)
select o.id, v.key, v.code, v.name, v.account_type
from public.organizations o
cross join (values
  ('fx_gain', '4010', 'Foreign Exchange Gain', 'revenue'),
  ('fx_loss', '5010', 'Foreign Exchange Loss', 'expense')
) as v(key, code, name, account_type)
on conflict (tenant_id, key) where key is not null do nothing;
