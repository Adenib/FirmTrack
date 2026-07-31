-- Usage safety net for the AI Assistant support channel (flat-fee, not
-- metered -- see support_assistant.md memory). `feature` is kept
-- generic (not just 'support_chat') so a future AI feature -- e.g.
-- TimeTrack's AI drafting -- can log into the same table without a
-- new migration.
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  feature text not null,
  input_tokens int not null,
  output_tokens int not null,
  created_at timestamptz not null default now()
);
create index ai_usage_log_tenant_feature_idx on public.ai_usage_log (tenant_id, feature, created_at);

-- Append-only, same treatment as document_events/matter_workflow_history.
revoke update, delete on public.ai_usage_log from anon, authenticated, service_role;
