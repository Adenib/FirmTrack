-- Multi-currency accounting, Phase 1, Workstream C2. A tenant's
-- base_currency (on organizations) is always implicitly "enabled" and
-- never appears here -- this table only lists ADDITIONAL currencies a
-- tenant has opted into using (billing_currency on clients/matters,
-- chart_of_accounts.currency, exchange rate pairs). Follows the existing
-- one-row-per-tenant settings pattern used by billtrack_settings/
-- doctrack_settings, but keyed per currency (a tenant can enable several).
create table if not exists public.accounttrack_currency_settings (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  currency text not null,
  enabled_at timestamptz not null default now(),
  enabled_by uuid references public.users(id),
  primary key (tenant_id, currency)
);

alter table public.accounttrack_currency_settings enable row level security;
drop policy if exists "accounttrack_currency_settings_select_own_tenant" on public.accounttrack_currency_settings;
create policy "accounttrack_currency_settings_select_own_tenant" on public.accounttrack_currency_settings
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
