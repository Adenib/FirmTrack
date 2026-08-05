-- Multi-currency accounting, Phase 3, Workstream A3: unrealized_fx_gain/
-- unrealized_fx_loss, kept separate from Phase 2's realized fx_gain/fx_loss
-- (4010/5010) so realized and unrealized FX stay distinct line items on the
-- Income Statement -- same "two separate accounts" preference confirmed for
-- Phase 2. Codes 4020/5020 confirmed free of collision across all tenants
-- (including AELEX PARTNERS' 747 real imported accounts) before this
-- migration was finalized.
insert into public.chart_of_accounts (tenant_id, key, code, name, account_type)
select o.id, v.key, v.code, v.name, v.account_type
from public.organizations o
cross join (values
  ('unrealized_fx_gain', '4020', 'Unrealized Foreign Exchange Gain', 'revenue'),
  ('unrealized_fx_loss', '5020', 'Unrealized Foreign Exchange Loss', 'expense')
) as v(key, code, name, account_type)
on conflict (tenant_id, key) where key is not null do nothing;
