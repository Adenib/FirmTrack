-- TimeTrack module: task codes, time entries, desktop-agent activity log, agent API keys.
-- No prior migrations folder existed in this repo; this establishes the convention
-- (supabase/migrations/<timestamp>_<name>.sql) going forward.

-- ============================================================
-- task_codes
-- ============================================================
create table if not exists public.task_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists task_codes_tenant_idx on public.task_codes (tenant_id);

alter table public.task_codes enable row level security;

create policy "task_codes_select_own_tenant" on public.task_codes
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- time_entries (Time Sheet + Quick Fee rows)
-- ============================================================
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  lawyer_id uuid references public.lawyers(id),
  matter_id uuid references public.matters(id),
  task_code_id uuid references public.task_codes(id),
  entry_date date not null,
  hours numeric(6, 2),
  rate_usd numeric(12, 2),
  amount_usd numeric(12, 2),
  expl_code text,
  explanation text,
  notes text,
  hold boolean not null default false,
  entry_type text not null default 'timesheet' check (entry_type in ('timesheet', 'quickfee')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'billed')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_entries_tenant_date_idx on public.time_entries (tenant_id, entry_date);
create index if not exists time_entries_tenant_lawyer_idx on public.time_entries (tenant_id, lawyer_id);
create index if not exists time_entries_tenant_matter_idx on public.time_entries (tenant_id, matter_id);

alter table public.time_entries enable row level security;

create policy "time_entries_select_own_tenant" on public.time_entries
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- activity_log (Windows desktop agent activity capture)
-- ============================================================
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  window_title text,
  process_name text,
  duration_seconds integer not null default 0,
  logged_at timestamptz not null default now(),
  converted_to_entry_id uuid references public.time_entries(id),
  created_at timestamptz not null default now()
);

create index if not exists activity_log_tenant_user_idx on public.activity_log (tenant_id, user_id, logged_at);

alter table public.activity_log enable row level security;

create policy "activity_log_select_own_tenant" on public.activity_log
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- agent_api_keys (per-tenant keys used by the desktop agent to POST activity)
-- ============================================================
create table if not exists public.agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id),
  label text,
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists agent_api_keys_tenant_idx on public.agent_api_keys (tenant_id);

alter table public.agent_api_keys enable row level security;

create policy "agent_api_keys_select_own_tenant" on public.agent_api_keys
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- No insert/update/delete policies are defined for any of the tables above:
-- all writes go through API routes using the service-role key, which bypasses RLS.
