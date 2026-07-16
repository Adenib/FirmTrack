-- Conflict-of-interest check audit trail: a search for name(s) must be
-- run and its results explicitly confirmed before a new matter can be
-- created (enforced server-side in POST /api/admin/matters, not just a
-- disabled button client-side). One row per matter, created atomically
-- alongside the matter row so the firm can later prove a conflict check
-- was actually performed before this matter was opened.
create table if not exists public.conflict_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid not null references public.matters(id) on delete cascade,
  search_terms text[] not null,
  -- Snapshot of what the search found at confirmation time (client/matter/
  -- time-entry matches) — kept even if those underlying rows later change
  -- or are deleted, since this is an audit record of what was seen, not a
  -- live query.
  results_snapshot jsonb,
  confirmed_no_conflict boolean not null default false,
  searched_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists conflict_checks_tenant_idx on public.conflict_checks (tenant_id);
create index if not exists conflict_checks_matter_idx on public.conflict_checks (matter_id);

alter table public.conflict_checks enable row level security;
drop policy if exists "conflict_checks_select_own_tenant" on public.conflict_checks;
create policy "conflict_checks_select_own_tenant" on public.conflict_checks
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
