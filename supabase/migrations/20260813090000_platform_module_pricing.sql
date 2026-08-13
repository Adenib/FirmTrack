-- Creator Console pricing management: today's TIER_PRICES/ADDON_PRICE_BASIC
-- (src/lib/billing/pricing.ts) are hardcoded TS constants with no way to
-- change them without a code deploy, and pricing is only ever a flat
-- per-tier number regardless of which specific module -- not genuinely
-- per-module. This table becomes the live, editable source of truth for
-- standard pricing, seeded to match today's computed values exactly (via
-- moduleMonthlyPrice()) so nothing changes for existing checkouts on day
-- one. Platform-wide, not tenant-scoped -- same class of table as the
-- pre-existing platform_admins/platform_settings/exchange_rates (all
-- predate this repo's migration history), accessed only through
-- service-role API routes, so RLS is enabled with no policies (deny-all
-- for anon/authenticated; service role bypasses RLS entirely).
create table if not exists public.platform_module_pricing (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  tier text not null check (tier in ('basic', 'standard', 'elite')),
  price numeric not null,
  currency text not null default 'NGN',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),
  unique (module, tier, currency)
);

alter table public.platform_module_pricing enable row level security;

insert into public.platform_module_pricing (module, tier, price, currency)
values
  -- Basic: free-tier-eligible modules at the Basic flat rate, the three
  -- paid add-ons at the add-on rate -- matches moduleMonthlyPrice()'s
  -- free/add-on branch exactly.
  ('timetrack', 'basic', 1500, 'NGN'),
  ('movementtrack', 'basic', 1500, 'NGN'),
  ('tasktrack', 'basic', 1500, 'NGN'),
  ('billtrack', 'basic', 1500, 'NGN'),
  ('accounttrack', 'basic', 2000, 'NGN'),
  ('doctrack', 'basic', 2000, 'NGN'),
  ('hrtrack', 'basic', 2000, 'NGN'),
  ('ai_support', 'basic', 2000, 'NGN'),
  -- Standard: flat per-module rate regardless of module.
  ('timetrack', 'standard', 2500, 'NGN'),
  ('movementtrack', 'standard', 2500, 'NGN'),
  ('tasktrack', 'standard', 2500, 'NGN'),
  ('billtrack', 'standard', 2500, 'NGN'),
  ('accounttrack', 'standard', 2500, 'NGN'),
  ('doctrack', 'standard', 2500, 'NGN'),
  ('hrtrack', 'standard', 2500, 'NGN'),
  ('ai_support', 'standard', 2500, 'NGN'),
  -- Elite: flat per-module rate regardless of module.
  ('timetrack', 'elite', 4000, 'NGN'),
  ('movementtrack', 'elite', 4000, 'NGN'),
  ('tasktrack', 'elite', 4000, 'NGN'),
  ('billtrack', 'elite', 4000, 'NGN'),
  ('accounttrack', 'elite', 4000, 'NGN'),
  ('doctrack', 'elite', 4000, 'NGN'),
  ('hrtrack', 'elite', 4000, 'NGN'),
  ('ai_support', 'elite', 4000, 'NGN')
on conflict (module, tier, currency) do nothing;
