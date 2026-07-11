-- AccountTrack Phase 2, Stage 3: budgets for both lawyers and matters.
-- One table, not two — lawyer-budgets and matter-budgets are structurally
-- identical (a target metric over a period) applied to two different FKs,
-- so a nullable-FK + XOR-check row fits better than duplicating the shape.

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  lawyer_id uuid references public.lawyers(id),
  matter_id uuid references public.matters(id),
  period_start date not null,
  period_end date not null,
  target_hours numeric(8, 2),
  target_billable_hours numeric(8, 2),
  target_revenue_usd numeric(12, 2),
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_exactly_one_owner check (
    (lawyer_id is not null and matter_id is null) or (lawyer_id is null and matter_id is not null)
  )
);

create unique index if not exists budgets_lawyer_period_uq
  on public.budgets (tenant_id, lawyer_id, period_start, period_end) where lawyer_id is not null;
create unique index if not exists budgets_matter_period_uq
  on public.budgets (tenant_id, matter_id, period_start, period_end) where matter_id is not null;
create index if not exists budgets_tenant_idx on public.budgets (tenant_id);

alter table public.budgets enable row level security;
drop policy if exists "budgets_select_own_tenant" on public.budgets;
create policy "budgets_select_own_tenant" on public.budgets
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
