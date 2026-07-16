-- HRTrack Stage 2: Performance evaluations. tasks.assigned_to already
-- exists on the live table (verified against the PostgREST OpenAPI
-- schema before writing this — predates this repo's migration history
-- like the rest of `tasks`) but was never wired into the app; this
-- migration only adds the new Evaluate concept, not a tasks change.
create table if not exists public.performance_evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  staff_user_id uuid not null references public.users(id),
  reviewer_user_id uuid not null references public.users(id),
  period text,
  rating integer not null check (rating between 1 and 5),
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists performance_evaluations_tenant_idx on public.performance_evaluations (tenant_id);
create index if not exists performance_evaluations_staff_idx on public.performance_evaluations (tenant_id, staff_user_id, created_at desc);

alter table public.performance_evaluations enable row level security;
drop policy if exists "performance_evaluations_select_own_tenant" on public.performance_evaluations;
create policy "performance_evaluations_select_own_tenant" on public.performance_evaluations
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
