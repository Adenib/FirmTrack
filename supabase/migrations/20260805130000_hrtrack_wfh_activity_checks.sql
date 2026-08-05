-- WFH activity monitoring: one row per "Are you still working from home?"
-- popup shown by the desktop agent (via powerMonitor.getSystemIdleState)
-- when a user has been idle 30+ minutes while clocked in with an open
-- 'remote' attendance_records row. status starts 'pending'; a click on the
-- popup flips it to 'confirmed'. Deliberately no third "expired" status --
-- a row simply stays 'pending' if never answered, and the end-of-day
-- digest treats any of today's 'pending' rows as a probable lapse.
create table if not exists public.wfh_activity_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  prompted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wfh_activity_checks_tenant_idx on public.wfh_activity_checks (tenant_id);
create index if not exists wfh_activity_checks_tenant_user_prompted_idx
  on public.wfh_activity_checks (tenant_id, user_id, prompted_at desc);

alter table public.wfh_activity_checks enable row level security;
drop policy if exists "wfh_activity_checks_select_own_tenant" on public.wfh_activity_checks;
create policy "wfh_activity_checks_select_own_tenant" on public.wfh_activity_checks
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
