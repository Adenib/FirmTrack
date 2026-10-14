-- AssetTrack: laptop repair tickets and an IT asset register. "IT staff"
-- reuses existing owner/admin/manager roles (no new 'it' role) -- see
-- ASSETTRACK_STAFF_ROLES in src/lib/assettrack/roles.ts, the single source
-- of truth every route and the UI import instead of re-declaring the list.
-- Table names are assettrack_-prefixed (unlike documents/requests) because
-- "assets" and "tickets" are too generic to leave bare in a shared schema.

create table if not exists public.assettrack_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  asset_tag text not null,
  serial_number text,
  make text,
  model text,
  assigned_to uuid references public.users(id) on delete set null,
  -- Raw assignee string preserved whenever a SharePoint row's assignee
  -- email/name didn't match any users.email -- never silently dropped.
  -- Null when assigned_to resolved or the asset was created manually.
  unresolved_assignee text,
  purchase_date date,
  warranty_end_date date,
  replacement_cost numeric(12, 2),
  asset_status text not null default 'active' check (asset_status in ('active', 'in_repair', 'loaned', 'retired')),
  -- Populated only for rows that came from the SharePoint sync; null for
  -- manually-created assets. Used as the upsert key on re-sync instead of
  -- asset_tag, which a SharePoint editor could rename.
  external_source text check (external_source in ('sharepoint')),
  external_item_id text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assettrack_assets_tenant_idx on public.assettrack_assets (tenant_id);
create unique index if not exists assettrack_assets_tenant_tag_idx on public.assettrack_assets (tenant_id, asset_tag);
create unique index if not exists assettrack_assets_external_idx on public.assettrack_assets (tenant_id, external_source, external_item_id)
  where external_source is not null;

alter table public.assettrack_assets enable row level security;
create policy "assettrack_assets_select_own_tenant" on public.assettrack_assets
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.assettrack_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid references public.assettrack_assets(id) on delete set null,
  reported_by uuid not null references public.users(id),
  status text not null default 'submitted' check (status in (
    'submitted', 'triage', 'remote_support', 'awaiting_device', 'diagnosis',
    'awaiting_approval', 'awaiting_parts', 'vendor_repair', 'testing',
    'ready_for_collection', 'returned', 'closed',
    'replacement_recommended', 'cancelled'
  )),
  category text not null check (category in ('software', 'hardware', 'charger_power', 'performance', 'physical_damage', 'other')),
  impact text not null default 'normal' check (impact in ('low', 'normal', 'high', 'critical')),
  issue_description text not null,
  triage_notes text,
  diagnosis text,
  data_backed_up boolean,
  backup_notes text,
  estimated_repair_cost numeric(12, 2),
  estimated_replacement_cost numeric(12, 2),
  decision text check (decision in ('repair', 'replace', 'warranty', 'pending')),
  decision_by uuid references public.users(id),
  decision_at timestamptz,
  vendor_name text,
  parts_status text,
  resolution_notes text,
  user_confirmed boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assettrack_tickets_tenant_idx on public.assettrack_tickets (tenant_id, status);
create index if not exists assettrack_tickets_tenant_asset_idx on public.assettrack_tickets (tenant_id, asset_id);
create index if not exists assettrack_tickets_tenant_reporter_idx on public.assettrack_tickets (tenant_id, reported_by);

alter table public.assettrack_tickets enable row level security;
create policy "assettrack_tickets_select_own_tenant" on public.assettrack_tickets
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- Append-only audit trail, same shape/intent as document_events -- one
-- plain insert() right after each mutation in the API route, not a trigger
-- or DB transaction. UPDATE/DELETE revoked below so this is genuinely
-- tamper-proof, not just app convention.
create table if not exists public.assettrack_ticket_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.assettrack_tickets(id) on delete cascade,
  user_id uuid references public.users(id),
  event_type text not null check (event_type in (
    'created', 'status_changed', 'triaged', 'diagnosed', 'decision_recorded',
    'sent_to_vendor', 'parts_updated', 'tested', 'returned_to_employee',
    'confirmed_by_employee', 'closed', 'cancelled', 'reopened'
  )),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists assettrack_ticket_events_ticket_idx on public.assettrack_ticket_events (ticket_id, created_at);

alter table public.assettrack_ticket_events enable row level security;
create policy "assettrack_ticket_events_select_own_tenant" on public.assettrack_ticket_events
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

revoke update, delete on public.assettrack_ticket_events from anon, authenticated, service_role;

-- Per-tenant SharePoint connection + column mapping for the recurring asset
-- sync. Not a one-off "link" like DocTrack's SharePoint file linking --
-- this is a saved, re-run-able config since AssetTrack's asset register is
-- kept in sync by repeated "Sync now" runs, not a single import.
create table if not exists public.assettrack_sync_settings (
  tenant_id uuid primary key references public.organizations(id) on delete cascade,
  sharepoint_site_id text,
  sharepoint_site_name text,
  sharepoint_list_id text,
  sharepoint_list_name text,
  -- { asset_tag: 'Column Display Name', serial_number: '...', make: '...',
  --   model: '...', assignee: '...', purchase_date: '...',
  --   warranty_end_date: '...', replacement_cost: '...' }
  -- Values are the SharePoint column's displayName, not its internal name
  -- -- a renamed column breaks the mapping, mitigated in app code by a
  -- hard error when a sync pass maps 0 of the configured fields.
  field_mapping jsonb not null default '{}',
  sla_days integer not null default 14,
  last_synced_at timestamptz,
  last_synced_by uuid references public.users(id),
  last_sync_summary jsonb,
  updated_at timestamptz not null default now()
);

alter table public.assettrack_sync_settings enable row level security;
create policy "assettrack_sync_settings_select_own_tenant" on public.assettrack_sync_settings
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- Seed pricing: Basic-tier add-on like accounttrack/doctrack/hrtrack/aitrack
-- (ADDON_PRICE_BASIC on Basic, flat TIER_PRICES on Standard/Elite).
insert into public.platform_module_pricing (module, tier, price, currency)
values
  ('assettrack', 'basic', 2000, 'NGN'),
  ('assettrack', 'standard', 2500, 'NGN'),
  ('assettrack', 'elite', 4000, 'NGN')
on conflict (module, tier, currency) do nothing;

-- subscriptions.module check constraint -- WIDEN, do not forget (every
-- prior module migration had to do this; it's invisible to code/migration
-- search, discovered only when an insert fails against it).
alter table public.subscriptions drop constraint if exists subscriptions_module_check;
alter table public.subscriptions add constraint subscriptions_module_check
  check (module in (
    'timetrack', 'movementtrack', 'tasktrack', 'billtrack', 'accounttrack',
    'doctrack', 'hrtrack', 'calentrack', 'admin', 'ai_support', 'aitrack',
    'assettrack'
  ));
