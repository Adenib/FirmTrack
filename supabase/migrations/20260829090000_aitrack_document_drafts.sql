-- AITrack Document Drafting Assistant: draft a legal document/clause from
-- a prompt, optionally grounded in a matter. Output is plain text -- no
-- document-generation dependency; a finished draft is saved into DocTrack
-- as a real .txt document via the EXISTING upload endpoint, not a new
-- write path here.
create table if not exists public.ai_document_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid references public.matters(id),
  document_type text not null,
  prompt text not null,
  content text not null,
  notes text,
  model text not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists ai_document_drafts_tenant_idx on public.ai_document_drafts (tenant_id, created_at desc);

alter table public.ai_document_drafts enable row level security;
create policy "ai_document_drafts_select_own_tenant" on public.ai_document_drafts
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
