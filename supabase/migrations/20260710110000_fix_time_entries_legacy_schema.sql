-- Fix schema drift on public.time_entries.
--
-- The 20260709120000_timetrack_module.sql migration used
-- `create table if not exists public.time_entries (...)`, intending to
-- create a richer schema (lawyer_id, matter_id, task_code_id, entry_date,
-- rate_usd, amount_usd, hold, entry_type, status, created_by, updated_at).
-- A `time_entries` table already existed in this project (pre-dating the
-- migrations folder, like `matters` and `users`), with a much simpler
-- legacy shape (id, tenant_id, user_id, matter text, description, hours,
-- billable, logged_at, created_at). Because the table already existed,
-- `if not exists` silently no-opped and none of the intended columns were
-- ever created — meaning src/app/api/timetrack/entries/route.ts (which
-- reads/writes lawyer_id/matter_id/task_code_id/entry_date/rate_usd/
-- amount_usd/hold/entry_type/status/created_by) has been failing against
-- production. This migration brings the live table up to that intended
-- shape via ALTER, backfilling what's derivable from the legacy columns,
-- and leaves the legacy columns (user_id, matter, description, logged_at)
-- in place rather than dropping them, since other unknown code/data may
-- still depend on them.

alter table public.time_entries add column if not exists lawyer_id uuid references public.lawyers(id);
alter table public.time_entries add column if not exists matter_id uuid references public.matters(id);
alter table public.time_entries add column if not exists task_code_id uuid references public.task_codes(id);
alter table public.time_entries add column if not exists entry_date date;
alter table public.time_entries add column if not exists rate_usd numeric(12, 2);
alter table public.time_entries add column if not exists amount_usd numeric(12, 2);
alter table public.time_entries add column if not exists expl_code text;
alter table public.time_entries add column if not exists explanation text;
alter table public.time_entries add column if not exists notes text;
alter table public.time_entries add column if not exists hold boolean not null default false;
alter table public.time_entries add column if not exists entry_type text not null default 'timesheet';
alter table public.time_entries add column if not exists status text not null default 'draft';
alter table public.time_entries add column if not exists created_by uuid references public.users(id);
alter table public.time_entries add column if not exists updated_at timestamptz not null default now();

-- Backfill from legacy columns, best-effort, before enforcing not-null.
update public.time_entries set entry_date = coalesce(entry_date, logged_at::date, created_at::date)
  where entry_date is null;

update public.time_entries set explanation = coalesce(explanation, description)
  where explanation is null;

update public.time_entries set created_by = coalesce(created_by, user_id)
  where created_by is null;

-- Best-effort match of the old free-text `matter` column to a real matter
-- by matter_id code, scoped per tenant. Leaves matter_id null where no
-- match is found (old entry stays visible, just unlinked from a matter).
update public.time_entries te
  set matter_id = m.id
  from public.matters m
  where te.matter_id is null
    and te.matter is not null
    and m.tenant_id = te.tenant_id
    and m.matter_id = te.matter;

-- Best-effort match of the legacy user_id to a lawyers row for the same
-- user, scoped per tenant. Leaves lawyer_id null where the user has no
-- corresponding lawyers record.
update public.time_entries te
  set lawyer_id = l.id
  from public.lawyers l
  where te.lawyer_id is null
    and te.user_id is not null
    and l.tenant_id = te.tenant_id
    and l.user_id = te.user_id;

alter table public.time_entries alter column entry_date set not null;

-- Constraints matching the originally-intended schema (added after backfill
-- so existing rows can't violate them retroactively during the ALTERs above).
alter table public.time_entries drop constraint if exists time_entries_entry_type_check;
alter table public.time_entries add constraint time_entries_entry_type_check
  check (entry_type in ('timesheet', 'quickfee'));

alter table public.time_entries drop constraint if exists time_entries_status_check;
alter table public.time_entries add constraint time_entries_status_check
  check (status in ('draft', 'submitted', 'billed'));

create index if not exists time_entries_tenant_date_idx on public.time_entries (tenant_id, entry_date);
create index if not exists time_entries_tenant_lawyer_idx on public.time_entries (tenant_id, lawyer_id);
create index if not exists time_entries_tenant_matter_idx on public.time_entries (tenant_id, matter_id);

alter table public.time_entries enable row level security;

drop policy if exists "time_entries_select_own_tenant" on public.time_entries;
create policy "time_entries_select_own_tenant" on public.time_entries
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
