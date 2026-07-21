-- DocTrack v1: matter-linked document storage, versioning, and an
-- audit trail. Phase 1 of a larger vision (email/Teams/scanner capture,
-- OCR, workflow automation are explicitly out of scope for this pass).
--
-- A 'documents' table already existed from an earlier, unfinished
-- attempt -- confirmed empty (0 rows) and unreferenced by any code in
-- this repo, and structurally incompatible with what this stage needs
-- (no versioning, no matter linkage, no audit trail; a single
-- storage_path/file_size/mime_type directly on the row instead).
-- Dropping and recreating rather than altering it into shape.
drop table if exists public.documents cascade;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid references public.matters(id) on delete set null, -- null = firm-wide
  title text not null,
  category text, -- free-form for v1 -- no rigid taxonomy yet
  created_by uuid not null references public.users(id),
  deleted_at timestamptz, -- soft delete only, never a hard DELETE
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_tenant_matter_idx on public.documents (tenant_id, matter_id);

-- Every upload creates a new row here rather than overwriting one --
-- version history is never mutated once written (enforced below).
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number int not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

-- Audit trail dedicated to document activity -- kept separate from
-- security_audit_log (that table is specifically security events;
-- mixing in every document view/download would bloat and blur it).
create table public.document_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid references public.users(id),
  event_type text not null check (event_type in (
    'created', 'version_uploaded', 'viewed', 'downloaded', 'renamed', 'deleted', 'restored'
  )),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- "Unchangeable system entries" -- both version history and the audit
-- trail are genuinely append-only: revoke UPDATE/DELETE at the DB level
-- so this holds even against an application bug, not just code
-- discipline. service_role is what every route in this app uses, so
-- this is the grant that actually matters to revoke.
revoke update, delete on public.document_versions from anon, authenticated, service_role;
revoke update, delete on public.document_events from anon, authenticated, service_role;

create table public.doctrack_settings (
  tenant_id uuid primary key references public.organizations(id) on delete cascade,
  retention_days int, -- null = keep forever (default)
  updated_at timestamptz not null default now()
);

-- Private bucket -- every read/write goes through the service-role
-- client in an API route (same pattern as request-attachments), so no
-- storage.objects RLS policy is needed; downloads are served via
-- short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
