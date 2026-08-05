-- Multi-currency accounting, Phase 1, Workstream D. Tenant-scoped, dated
-- exchange rates -- distinct from the pre-existing platform-level
-- exchange_rates table, which stays untouched (it serves one unrelated
-- purpose: converting platform_settings default lawyer billing rates
-- from USD to NGN for display, read by /api/admin/lawyers and
-- /api/admin/clients/detail). Insert-only by convention (no UPDATE/
-- DELETE exposed at the API layer) so every rate change is a new dated
-- row -- a real audit trail, unlike the old single mutable row this
-- deliberately does not touch.
create table if not exists public.accounttrack_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  from_currency text not null,
  to_currency text not null,
  rate numeric(18, 6) not null check (rate > 0),
  effective_date date not null default current_date,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists accounttrack_exchange_rates_tenant_pair_idx
  on public.accounttrack_exchange_rates (tenant_id, from_currency, to_currency, effective_date desc);

alter table public.accounttrack_exchange_rates enable row level security;
drop policy if exists "accounttrack_exchange_rates_select_own_tenant" on public.accounttrack_exchange_rates;
create policy "accounttrack_exchange_rates_select_own_tenant" on public.accounttrack_exchange_rates
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
