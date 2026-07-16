-- HRTrack Stage 1: Attendance (clock in/out with real GPS + reverse
-- geocoding). office_locations lets a firm configure known office
-- coordinates; a clock-in within radius_meters of any of them is tagged
-- 'office', otherwise 'remote' (which requires a note in application code,
-- not enforced here since the requirement is conditional on distance, not
-- expressible as a simple CHECK constraint against other columns).
create table if not exists public.office_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  radius_meters integer not null default 200,
  created_at timestamptz not null default now()
);

create index if not exists office_locations_tenant_idx on public.office_locations (tenant_id);

alter table public.office_locations enable row level security;
drop policy if exists "office_locations_select_own_tenant" on public.office_locations;
create policy "office_locations_select_own_tenant" on public.office_locations
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- hours is deliberately not stored — computed at read time from
-- clock_out_at - clock_in_at, matching the "derived, not duplicated"
-- convention used for trust-ledger balances elsewhere in this app.
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  clock_in_at timestamptz not null default now(),
  clock_in_lat numeric(10, 7),
  clock_in_lng numeric(10, 7),
  clock_in_location text,
  clock_out_at timestamptz,
  clock_out_lat numeric(10, 7),
  clock_out_lng numeric(10, 7),
  clock_out_location text,
  status text not null default 'remote' check (status in ('office', 'remote')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists attendance_records_tenant_idx on public.attendance_records (tenant_id);
create index if not exists attendance_records_tenant_user_idx on public.attendance_records (tenant_id, user_id, clock_in_at desc);

alter table public.attendance_records enable row level security;
drop policy if exists "attendance_records_select_own_tenant" on public.attendance_records;
create policy "attendance_records_select_own_tenant" on public.attendance_records
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
