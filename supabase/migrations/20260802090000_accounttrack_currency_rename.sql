-- Multi-currency accounting, Phase 1, Workstream A: every "_usd" column
-- across the ledger is legacy misleading naming from when this codebase
-- assumed a single implicit currency. In practice the whole system is
-- NGN-denominated today (invoice-pdf.ts's fmtUsd() literally renders a
-- Naira symbol) -- there was never a real "USD" semantic here. Dropping
-- the suffix now, before adding real per-transaction currency columns in
-- a later migration in this series, so a column doesn't end up named
-- "amount_usd" while also carrying a "currency" column that says 'GBP'.
--
-- Pure RENAME COLUMN throughout (no drop/recreate) -- data-preserving,
-- and must not disturb the real, already-posted general ledger for
-- tenant AELEX PARTNERS (730 journal lines imported this session).

alter table public.journal_lines rename column debit_usd to debit;
alter table public.journal_lines rename column credit_usd to credit;
-- journal_lines_single_sided's check expression is rewritten by Postgres
-- automatically on column rename -- no separate constraint touch needed.

alter table public.invoices rename column fees_amount_usd to fees_amount;
alter table public.invoices rename column disbursements_amount_usd to disbursements_amount;
alter table public.invoices rename column total_amount_usd to total_amount;
alter table public.invoices rename column paid_amount_usd to paid_amount;

alter table public.time_entries rename column rate_usd to rate;
alter table public.time_entries rename column amount_usd to amount;

alter table public.disbursements rename column amount_usd to amount;
alter table public.trust_ledger_entries rename column amount_usd to amount;
alter table public.payroll_salaries rename column amount_usd to amount;
alter table public.payroll_line_items rename column base_salary_usd to base_salary;
alter table public.payroll_line_items rename column leave_allowance_usd to leave_allowance;
alter table public.budgets rename column target_revenue_usd to target_revenue;
alter table public.lawyer_rates rename column amount_usd to amount;

-- post_journal_entry -- the one stored function in this codebase --
-- reads/writes debit_usd/credit_usd both as JSONB keys (the p_lines
-- contract from src/lib/accounttrack/post-journal-entry.ts) and as the
-- journal_lines insert column list. Both renamed together since the RPC
-- and its one TS caller are updated in the same change.
create or replace function public.post_journal_entry(
  p_tenant_id uuid,
  p_entry_date date,
  p_description text,
  p_source_type text,
  p_source_id uuid,
  p_created_by uuid,
  p_lines jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_entry_id uuid;
  v_debit numeric(14, 2);
  v_credit numeric(14, 2);
begin
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_debit, v_credit
    from jsonb_array_elements(p_lines) l;

  if v_debit != v_credit or v_debit = 0 then
    raise exception 'journal entry not balanced or empty: debit=% credit=%', v_debit, v_credit;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where not exists (
      select 1 from public.chart_of_accounts a
      where a.id = (l ->> 'account_id')::uuid and a.tenant_id = p_tenant_id
    )
  ) then
    raise exception 'account does not belong to tenant';
  end if;

  if exists (
    select 1 from public.accounting_periods ap
    where ap.tenant_id = p_tenant_id
      and ap.status = 'closed'
      and p_entry_date between ap.period_start and ap.period_end
  ) then
    raise exception 'accounting period is closed for date %', p_entry_date;
  end if;

  insert into public.journal_entries (tenant_id, entry_date, description, source_type, source_id, created_by)
  values (p_tenant_id, p_entry_date, p_description, p_source_type, p_source_id, p_created_by)
  returning id into v_entry_id;

  insert into public.journal_lines (tenant_id, journal_entry_id, account_id, matter_id, lawyer_id, debit, credit, description)
  select
    p_tenant_id,
    v_entry_id,
    (l ->> 'account_id')::uuid,
    nullif(l ->> 'matter_id', '')::uuid,
    nullif(l ->> 'lawyer_id', '')::uuid,
    coalesce((l ->> 'debit')::numeric, 0),
    coalesce((l ->> 'credit')::numeric, 0),
    l ->> 'description'
  from jsonb_array_elements(p_lines) l;

  return v_entry_id;
end;
$$;
