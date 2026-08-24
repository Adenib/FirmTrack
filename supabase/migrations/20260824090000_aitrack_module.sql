-- AITrack: a new top-level module, v1 = Document Review & Analysis plus
-- configurable Playbooks. Also the new single gate for the existing
-- Support Assistant (previously its own 'ai_support' module) -- see the
-- grandfathering insert below. TimeTrack's AI drafting deliberately stays
-- on its own free toggle, untouched by this migration -- it has no
-- subscription gate today, and folding it under a paid module is a
-- separate decision, not part of this pass.

create table if not exists public.ai_playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null, -- [{ label: text, instructions: text }, ...]
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_playbooks_tenant_idx on public.ai_playbooks (tenant_id);

alter table public.ai_playbooks enable row level security;
create policy "ai_playbooks_select_own_tenant" on public.ai_playbooks
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.ai_document_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id),
  playbook_id uuid references public.ai_playbooks(id),
  reviewed_by uuid not null references public.users(id),
  summary text not null,
  key_terms jsonb not null default '[]',   -- [{ label, value }]
  key_dates jsonb not null default '[]',   -- [{ label, date }]
  risk_flags jsonb not null default '[]',  -- [{ severity, description }]
  playbook_results jsonb,                  -- [{ rule_label, status, notes }], null if no playbook was used
  model text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_document_reviews_tenant_idx on public.ai_document_reviews (tenant_id, document_id, created_at desc);

alter table public.ai_document_reviews enable row level security;
create policy "ai_document_reviews_select_own_tenant" on public.ai_document_reviews
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- Widen document_events for the new 'ai_reviewed' event a review logs,
-- mirroring 'viewed'/'downloaded'.
alter table public.document_events drop constraint if exists document_events_event_type_check;
alter table public.document_events add constraint document_events_event_type_check
  check (event_type in ('created', 'version_uploaded', 'viewed', 'downloaded', 'renamed', 'deleted', 'restored', 'ai_reviewed'));

-- Seed standard pricing for the new module, same Basic/Standard/Elite NGN
-- rates ai_support already uses -- editable afterward via the existing
-- Creator Console pricing page, same as every other module.
insert into public.platform_module_pricing (module, tier, price, currency)
values
  ('aitrack', 'basic', 2000, 'NGN'),
  ('aitrack', 'standard', 2500, 'NGN'),
  ('aitrack', 'elite', 4000, 'NGN')
on conflict (module, tier, currency) do nothing;

-- subscriptions.module has a check constraint (predates this repo's
-- migration history, so it's invisible to code/migration search --
-- discovered only when the insert below failed against it). Widen it to
-- include 'aitrack', using the exact set of module values already live in
-- the table today (confirmed via a live query) plus the new one.
alter table public.subscriptions drop constraint if exists subscriptions_module_check;
alter table public.subscriptions add constraint subscriptions_module_check
  check (module in (
    'timetrack', 'movementtrack', 'tasktrack', 'billtrack', 'accounttrack',
    'doctrack', 'hrtrack', 'calentrack', 'admin', 'ai_support', 'aitrack'
  ));

-- Grandfather every tenant with an active ai_support subscription onto
-- aitrack too, so nobody loses Support Assistant access once its route
-- switches to checking 'aitrack' instead of 'ai_support'. A NOT EXISTS
-- guard is used instead of ON CONFLICT -- subscriptions predates this
-- repo's migration history and no unique constraint on
-- (tenant_id, module) was confirmed to rely on. paystack_subscription_code
-- is deliberately NOT copied: the original ai_support row remains the
-- real billing record (and keeps its live Paystack link); this new
-- aitrack row only carries the is_active grant riding on it, avoiding two
-- DB rows referencing the same Paystack subscription.
insert into public.subscriptions (tenant_id, module, tier, is_active, annual_billing, price_per_user, billing_cycle_start, billing_cycle_end)
select s.tenant_id, 'aitrack', s.tier, true, s.annual_billing, s.price_per_user, s.billing_cycle_start, s.billing_cycle_end
from public.subscriptions s
where s.module = 'ai_support'
  and s.is_active = true
  and not exists (
    select 1 from public.subscriptions existing
    where existing.tenant_id = s.tenant_id and existing.module = 'aitrack'
  );
