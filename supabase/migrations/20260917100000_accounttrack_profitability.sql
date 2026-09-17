-- Client/Matter Profitability: internal cost rates (never salary data --
-- an admin-configured NGN/hour-style rate used only for internal cost
-- math) plus write-off tracking and a frozen-at-entry-time cost snapshot
-- on time_entries, mirroring how `rate`/`amount` already freeze the
-- billing rate so historical profitability doesn't shift when a cost
-- rate changes later.

create table if not exists public.internal_cost_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  lawyer_id uuid references public.lawyers(id),
  category_id uuid references public.lawyer_categories(id),
  rate numeric(12, 2) not null,
  currency text not null default 'NGN',
  effective_from date not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint internal_cost_rates_exactly_one_owner check (
    (lawyer_id is not null and category_id is null) or (lawyer_id is null and category_id is not null)
  )
);

create unique index if not exists internal_cost_rates_lawyer_effective_uq
  on public.internal_cost_rates (tenant_id, lawyer_id, effective_from) where lawyer_id is not null;
create unique index if not exists internal_cost_rates_category_effective_uq
  on public.internal_cost_rates (tenant_id, category_id, effective_from) where category_id is not null;
create index if not exists internal_cost_rates_tenant_idx on public.internal_cost_rates (tenant_id);

alter table public.internal_cost_rates enable row level security;
drop policy if exists "internal_cost_rates_select_own_tenant" on public.internal_cost_rates;
create policy "internal_cost_rates_select_own_tenant" on public.internal_cost_rates
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

alter table public.time_entries
  add column if not exists write_off_amount numeric(12, 2) not null default 0,
  add column if not exists write_off_reason text,
  add column if not exists internal_cost_rate numeric(12, 2),
  add column if not exists internal_cost_amount numeric(12, 2);
