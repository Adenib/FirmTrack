-- Multi-currency accounting, Phase 1, Workstream C3. Schema-only
-- groundwork for a later phase's FX-gain/loss work -- per the source
-- spec ("both amounts are stored"), not derived at read time. Every
-- existing row backfills to currency = tenant's base_currency,
-- base_currency_amount = <existing amount> (accurate: nothing
-- multi-currency has ever actually happened). journal_lines
-- deliberately does NOT get these columns in this phase --
-- post_journal_entry's debit==credit balance check is currently a
-- same-currency assumption; real conversion logic is later-phase work.

alter table public.invoices add column if not exists currency text;
alter table public.invoices add column if not exists base_currency_amount numeric(12, 2);
update public.invoices i set
  currency = coalesce(i.currency, (select o.base_currency from public.organizations o where o.id = i.tenant_id)),
  base_currency_amount = coalesce(i.base_currency_amount, i.total_amount)
where i.currency is null or i.base_currency_amount is null;
alter table public.invoices alter column currency set default 'NGN';
alter table public.invoices alter column currency set not null;

alter table public.time_entries add column if not exists currency text;
alter table public.time_entries add column if not exists base_currency_amount numeric(12, 2);
update public.time_entries t set
  currency = coalesce(t.currency, (select o.base_currency from public.organizations o where o.id = t.tenant_id)),
  base_currency_amount = coalesce(t.base_currency_amount, t.amount)
where t.currency is null or t.base_currency_amount is null;
alter table public.time_entries alter column currency set default 'NGN';
alter table public.time_entries alter column currency set not null;

alter table public.disbursements add column if not exists currency text;
alter table public.disbursements add column if not exists base_currency_amount numeric(12, 2);
update public.disbursements d set
  currency = coalesce(d.currency, (select o.base_currency from public.organizations o where o.id = d.tenant_id)),
  base_currency_amount = coalesce(d.base_currency_amount, d.amount)
where d.currency is null or d.base_currency_amount is null;
alter table public.disbursements alter column currency set default 'NGN';
alter table public.disbursements alter column currency set not null;

alter table public.trust_ledger_entries add column if not exists currency text;
alter table public.trust_ledger_entries add column if not exists base_currency_amount numeric(12, 2);
update public.trust_ledger_entries tl set
  currency = coalesce(tl.currency, (select o.base_currency from public.organizations o where o.id = tl.tenant_id)),
  base_currency_amount = coalesce(tl.base_currency_amount, tl.amount)
where tl.currency is null or tl.base_currency_amount is null;
alter table public.trust_ledger_entries alter column currency set default 'NGN';
alter table public.trust_ledger_entries alter column currency set not null;
