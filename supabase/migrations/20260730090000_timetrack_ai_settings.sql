-- AI-powered time capture: a tenant-level on/off switch, same shape as
-- doctrack_settings/billtrack_settings. Defaults to disabled -- an
-- owner/admin must explicitly opt in. This is one of two required
-- gates before any AI call happens; the other is whether
-- ANTHROPIC_API_KEY is even configured (a platform-level gate, not
-- stored here -- if it's absent, the feature is inert regardless of
-- this flag).
create table public.timetrack_settings (
  tenant_id uuid primary key references public.organizations(id) on delete cascade,
  ai_drafting_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
