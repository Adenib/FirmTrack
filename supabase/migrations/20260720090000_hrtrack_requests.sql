-- HRTrack Stage 3: Requests (Leave, Redeployment, Grievance, Exit) as one
-- unified table with a type-specific `details` jsonb payload -- the four
-- types share the same submit/review workflow shape and only differ in
-- what they carry, so four near-duplicate tables would just be repetition.
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  type text not null check (type in ('leave', 'redeployment', 'grievance', 'exit')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  details jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.users(id),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requests_tenant_idx on public.requests (tenant_id);
create index if not exists requests_tenant_user_idx on public.requests (tenant_id, user_id, created_at desc);
create index if not exists requests_tenant_type_idx on public.requests (tenant_id, type, status);

alter table public.requests enable row level security;
drop policy if exists "requests_select_scoped" on public.requests;
-- Grievances are only visible to the submitter and owner/admin (not
-- 'manager' -- a manager could be the grievance's subject); every other
-- type is tenant-wide visible like the rest of this app. This is
-- defense-in-depth: API routes read via the service-role client (which
-- bypasses RLS) and must apply the identical filter in application code
-- -- this policy only protects any future direct browser-client read.
create policy "requests_select_scoped" on public.requests
  for select
  using (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and (
      type != 'grievance'
      or user_id = auth.uid()
      or (select role from public.users where id = auth.uid()) in ('owner', 'admin')
    )
  );

-- Per-tenant configurable leave categories with an annual allocation.
-- Remaining balance is NOT stored here -- it's computed at read time from
-- approved leave requests, matching the "derived, not duplicated"
-- convention already used for trust-ledger balances and attendance hours.
create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  annual_days numeric(5, 1) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists leave_types_tenant_idx on public.leave_types (tenant_id);

alter table public.leave_types enable row level security;
drop policy if exists "leave_types_select_own_tenant" on public.leave_types;
create policy "leave_types_select_own_tenant" on public.leave_types
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
