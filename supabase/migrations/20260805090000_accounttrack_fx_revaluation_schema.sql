-- Multi-currency accounting, Phase 3, Workstream A1: journal_lines has
-- always been purely base-currency -- there's no way to know that a line
-- posted against a genuinely foreign-currency chart_of_accounts row (e.g.
-- a real USD bank account, marked via the already-existing
-- chart_of_accounts.currency column) actually represents a foreign-currency
-- cash movement. Adding original_currency/original_amount so period-end
-- revaluation has something to revalue -- populated only for lines against
-- a foreign-currency account; every other line (the overwhelming majority)
-- keeps these null, unchanged from today's behavior.
--
-- Also widens accounting_periods with revaluation_entry_id (separate from
-- closing_entry_id, since month-type closes post no entry today but
-- revaluation should run for both period types) and widens
-- journal_entries_source_type_check for the three new source types this
-- phase introduces.

alter table public.journal_lines add column if not exists original_currency text;
alter table public.journal_lines add column if not exists original_amount numeric(12, 2);

alter table public.accounting_periods add column if not exists revaluation_entry_id uuid references public.journal_entries(id);

alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check check (source_type in (
  'invoice_created', 'invoice_payment', 'invoice_void', 'disbursement_recorded',
  'trust_deposit', 'trust_withdrawal', 'retainer_deposit', 'retainer_withdrawal',
  'manual', 'year_close', 'year_reopen', 'gl_import', 'payroll_run',
  'fx_revaluation_manual', 'fx_revaluation_period_close', 'fx_revaluation_reopen'
));

-- post_journal_entry -- adds two optional JSONB keys (original_currency,
-- original_amount) per line, defaulting to null, same treatment as every
-- existing optional key (matter_id, lawyer_id, description).
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

  insert into public.journal_lines (
    tenant_id, journal_entry_id, account_id, matter_id, lawyer_id, debit, credit, description,
    original_currency, original_amount
  )
  select
    p_tenant_id,
    v_entry_id,
    (l ->> 'account_id')::uuid,
    nullif(l ->> 'matter_id', '')::uuid,
    nullif(l ->> 'lawyer_id', '')::uuid,
    coalesce((l ->> 'debit')::numeric, 0),
    coalesce((l ->> 'credit')::numeric, 0),
    l ->> 'description',
    l ->> 'original_currency',
    nullif(l ->> 'original_amount', '')::numeric
  from jsonb_array_elements(p_lines) l;

  return v_entry_id;
end;
$$;
