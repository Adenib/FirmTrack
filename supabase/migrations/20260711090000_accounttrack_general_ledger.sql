-- AccountTrack Phase 2, Stage 2: real double-entry Chart of Accounts +
-- General Ledger, on top of Phase 1's invoices/disbursements/
-- trust_ledger_entries. See the "AccountTrack Phase 2" plan for full
-- rationale (net/agency method for disbursement cost recovery, why
-- journal_lines uses separate debit_usd/credit_usd columns, why this is
-- the one deliberate exception to the codebase's "no stored functions"
-- convention).

-- ============================================================
-- chart_of_accounts
-- ============================================================
create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  key text,
  code text,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists chart_of_accounts_tenant_code_uq
  on public.chart_of_accounts (tenant_id, code) where code is not null;
create unique index if not exists chart_of_accounts_tenant_key_uq
  on public.chart_of_accounts (tenant_id, key) where key is not null;
create index if not exists chart_of_accounts_tenant_idx on public.chart_of_accounts (tenant_id);

alter table public.chart_of_accounts enable row level security;
drop policy if exists "chart_of_accounts_select_own_tenant" on public.chart_of_accounts;
create policy "chart_of_accounts_select_own_tenant" on public.chart_of_accounts
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- journal_entries (header — one per posted event)
-- ============================================================
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  entry_date date not null default current_date,
  description text,
  source_type text not null check (source_type in (
    'invoice_created', 'invoice_payment', 'invoice_void', 'disbursement_recorded',
    'trust_deposit', 'trust_withdrawal', 'retainer_deposit', 'retainer_withdrawal',
    'manual', 'year_close', 'year_reopen'
  )),
  source_id uuid,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists journal_entries_tenant_date_idx on public.journal_entries (tenant_id, entry_date);
create index if not exists journal_entries_tenant_source_idx on public.journal_entries (tenant_id, source_type, source_id);

alter table public.journal_entries enable row level security;
drop policy if exists "journal_entries_select_own_tenant" on public.journal_entries;
create policy "journal_entries_select_own_tenant" on public.journal_entries
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- journal_lines (the actual debit/credit rows)
-- ============================================================
create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id),
  matter_id uuid references public.matters(id),
  lawyer_id uuid references public.lawyers(id),
  debit_usd numeric(12, 2) not null default 0,
  credit_usd numeric(12, 2) not null default 0,
  description text,
  created_at timestamptz not null default now(),
  constraint journal_lines_single_sided check (
    (debit_usd > 0 and credit_usd = 0) or (credit_usd > 0 and debit_usd = 0)
  )
);

create index if not exists journal_lines_tenant_entry_idx on public.journal_lines (tenant_id, journal_entry_id);
create index if not exists journal_lines_tenant_account_idx on public.journal_lines (tenant_id, account_id);
create index if not exists journal_lines_tenant_matter_idx on public.journal_lines (tenant_id, matter_id);

alter table public.journal_lines enable row level security;
drop policy if exists "journal_lines_select_own_tenant" on public.journal_lines;
create policy "journal_lines_select_own_tenant" on public.journal_lines
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- accounting_periods
-- ============================================================
create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  period_type text not null check (period_type in ('month', 'year')),
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.users(id),
  closing_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now()
);

create unique index if not exists accounting_periods_tenant_type_start_uq
  on public.accounting_periods (tenant_id, period_type, period_start);
create index if not exists accounting_periods_tenant_status_idx on public.accounting_periods (tenant_id, status);

alter table public.accounting_periods enable row level security;
drop policy if exists "accounting_periods_select_own_tenant" on public.accounting_periods;
create policy "accounting_periods_select_own_tenant" on public.accounting_periods
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- Seed the 8 default accounts for every existing tenant.
-- Kept in sync by hand with src/lib/accounttrack/default-accounts.ts
-- (migrations are pure SQL, so there's no shared import between the two).
-- ============================================================
insert into public.chart_of_accounts (tenant_id, key, code, name, account_type)
select o.id, v.key, v.code, v.name, v.account_type
from public.organizations o
cross join (values
  ('operating_cash', '1000', 'Operating Cash', 'asset'),
  ('trust_bank', '1010', 'Trust Bank Account', 'asset'),
  ('accounts_receivable', '1100', 'Accounts Receivable', 'asset'),
  ('client_costs_advanced', '1200', 'Costs Advanced to Clients', 'asset'),
  ('trust_liability', '2000', 'Trust Liabilities (Client Funds Held)', 'liability'),
  ('retainer_liability', '2010', 'Retainer Liabilities (Unearned Fees Held)', 'liability'),
  ('fees_earned', '4000', 'Fees Earned', 'revenue'),
  ('retained_earnings', '3000', 'Retained Earnings', 'equity')
) as v(key, code, name, account_type)
on conflict (tenant_id, key) where key is not null do nothing;

-- ============================================================
-- post_journal_entry — the one deliberate exception to this codebase's
-- "no stored functions" convention. Every other write here is a sequential
-- Supabase JS call with no transaction; that's fine when a stray row is
-- self-healing (e.g. an unbilled time entry). A partially-written journal
-- entry is not self-healing — it silently breaks the debits=credits
-- invariant that makes the GL meaningful. A single PL/pgSQL function body
-- is atomic without an explicit begin/commit, which is all the guarantee
-- needed here. Only ever called via the service-role key from server
-- routes (never client-side), so security invoker is fine.
-- ============================================================
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
  select coalesce(sum((l ->> 'debit_usd')::numeric), 0), coalesce(sum((l ->> 'credit_usd')::numeric), 0)
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

  insert into public.journal_lines (tenant_id, journal_entry_id, account_id, matter_id, lawyer_id, debit_usd, credit_usd, description)
  select
    p_tenant_id,
    v_entry_id,
    (l ->> 'account_id')::uuid,
    nullif(l ->> 'matter_id', '')::uuid,
    nullif(l ->> 'lawyer_id', '')::uuid,
    coalesce((l ->> 'debit_usd')::numeric, 0),
    coalesce((l ->> 'credit_usd')::numeric, 0),
    l ->> 'description'
  from jsonb_array_elements(p_lines) l;

  return v_entry_id;
end;
$$;
