-- HRTrack Stage 4: Payroll/Compensation. Closes the gap left by
-- leave_allowance_amount ("just a record, not an actual disbursement,
-- since there's no payroll system to derive it from yet") by making it
-- a real, journal-posted payout.

-- ============================================================
-- payroll_salaries — effective-dated, mirrors lawyer_rates: a salary
-- change is a new row, never an update, so a historical payroll run
-- stays accurate even if pay is changed later. "Current" salary for a
-- user = the row with the latest effective_from <= today.
-- ============================================================
create table if not exists public.payroll_salaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  amount_usd numeric(12, 2) not null,
  effective_from date not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists payroll_salaries_tenant_user_idx
  on public.payroll_salaries (tenant_id, user_id, effective_from desc);

alter table public.payroll_salaries enable row level security;
drop policy if exists "payroll_salaries_select_scoped" on public.payroll_salaries;
-- Compensation data is more sensitive than anything else in HRTrack --
-- unlike leave_types/requests (tenant-wide select), only owner/admin or
-- the row's own user can see it. Defense-in-depth as usual: every API
-- route re-applies this same check in application code since routes
-- read via the service-role client, which bypasses RLS.
create policy "payroll_salaries_select_scoped" on public.payroll_salaries
  for select
  using (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and (
      user_id = auth.uid()
      or (select role from public.users where id = auth.uid()) in ('owner', 'admin')
    )
  );

-- ============================================================
-- payroll_runs — one per pay period. draft -> posted, then immutable
-- (matches the closed-accounting-period / "a request can't be reviewed
-- twice" precedent already in this codebase).
-- ============================================================
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  created_by uuid references public.users(id),
  posted_by uuid references public.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payroll_runs_tenant_idx on public.payroll_runs (tenant_id, period_start desc);

alter table public.payroll_runs enable row level security;
drop policy if exists "payroll_runs_select_privileged" on public.payroll_runs;
-- A run header has no user_id of its own to self-scope by -- owner/admin
-- only. Individual employees see their own pay via payroll_line_items,
-- not this table.
create policy "payroll_runs_select_privileged" on public.payroll_runs
  for select
  using (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
  );

-- ============================================================
-- payroll_line_items — one per employee per run. base_salary_usd and
-- leave_allowance_usd are deliberate SNAPSHOTS taken when the run is
-- created (not a "derived, not duplicated" violation -- a payslip must
-- stay accurate even if the salary record changes later, exactly like
-- an invoice line item snapshots a rate rather than pointing live at
-- it). Net pay is NOT stored -- it's base + leave_allowance -
-- sum(deductions), computed by a small pure helper wherever needed,
-- since every input already lives on the row.
-- ============================================================
create table if not exists public.payroll_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  user_id uuid not null references public.users(id),
  base_salary_usd numeric(12, 2) not null,
  leave_allowance_usd numeric(12, 2) not null default 0,
  deductions jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payroll_line_items_tenant_run_idx
  on public.payroll_line_items (tenant_id, payroll_run_id);
create index if not exists payroll_line_items_tenant_user_idx
  on public.payroll_line_items (tenant_id, user_id, created_at desc);

alter table public.payroll_line_items enable row level security;
drop policy if exists "payroll_line_items_select_scoped" on public.payroll_line_items;
create policy "payroll_line_items_select_scoped" on public.payroll_line_items
  for select
  using (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and (
      user_id = auth.uid()
      or (select role from public.users where id = auth.uid()) in ('owner', 'admin')
    )
  );

-- Marks a leave request's allowance as paid, so a later payroll run
-- can't pull the same approved leave allowance in twice.
alter table public.requests add column if not exists paid_in_payroll_run_id uuid references public.payroll_runs(id);

-- Widen journal_entries.source_type to accept payroll postings.
alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check
  check (source_type in (
    'invoice_created', 'invoice_payment', 'invoice_void', 'disbursement_recorded',
    'trust_deposit', 'trust_withdrawal', 'retainer_deposit', 'retainer_withdrawal',
    'manual', 'year_close', 'year_reopen', 'payroll_run'
  ));

-- ============================================================
-- Two new chart-of-accounts entries -- 'expense' and 'liability' were
-- already valid account_type values, just unused until now. New tenants
-- get these via /api/register's existing DEFAULT_ACCOUNTS seed loop;
-- this backfills every existing tenant the same way the original 8 were
-- seeded for pre-migration tenants.
-- ============================================================
insert into public.chart_of_accounts (tenant_id, key, code, name, account_type)
select o.id, v.key, v.code, v.name, v.account_type
from public.organizations o
cross join (values
  ('salaries_expense', '5000', 'Salaries Expense', 'expense'),
  ('payroll_liabilities', '2020', 'Payroll Liabilities (Deductions Payable)', 'liability')
) as v(key, code, name, account_type)
on conflict (tenant_id, key) where key is not null do nothing;
