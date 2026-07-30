-- Litigation Workflow: Phase 1 of practice-area workflow automation.
-- A code-defined stage tracker for matters (litigation first; other
-- practice areas are future registry entries, not further migrations).
-- Reuses TaskTrack/CalenTrack for the actual checklist/deadline work --
-- this only adds the columns needed to track which stage a matter is
-- in and an append-only history of how it got there.

alter table public.matters add column if not exists workflow_template text;
alter table public.matters add column if not exists workflow_stage text;
alter table public.matters add column if not exists workflow_started_at timestamptz;

-- tasks has no matter linkage at all today -- needed so workflow-stage-
-- generated checklist tasks can be tied to and filtered by matter.
alter table public.tasks add column if not exists matter_id uuid references public.matters(id) on delete set null;
create index if not exists tasks_tenant_matter_idx on public.tasks (tenant_id, matter_id);

create table public.matter_workflow_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid not null references public.matters(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index matter_workflow_history_tenant_matter_idx on public.matter_workflow_history (tenant_id, matter_id);

-- Genuinely append-only, same treatment as document_events/document_versions:
-- revoke UPDATE/DELETE at the DB level so it holds even against an
-- application bug, not just code discipline. service_role is what every
-- route in this app uses, so this is the grant that actually matters.
revoke update, delete on public.matter_workflow_history from anon, authenticated, service_role;

alter table public.matter_workflow_history enable row level security;

create policy "matter_workflow_history_select_own_tenant" on public.matter_workflow_history
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
