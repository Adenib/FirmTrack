-- DocTrack Phase 2a: link files from Microsoft OneDrive (metadata/link
-- only -- no file content is ever copied into our own storage).
--
-- Storing these as plain text in a service-role-only table matches this
-- app's existing precedent for third-party secrets (e.g.
-- billtrack_settings.custom_resend_api_key) rather than introducing new
-- encryption infrastructure inconsistent with the rest of the codebase.
create table public.microsoft_graph_tokens (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null, -- what was actually granted -- lets us detect "needs reconnect"
  updated_at timestamptz not null default now()
);

-- A linked document has no rows in document_versions at all -- OneDrive
-- is the versioning authority for it, not us. null external_source (the
-- existing Stage-1 case) means "stored in our own bucket," unchanged.
alter table public.documents
  add column if not exists external_source text,
  add column if not exists external_item_id text,
  add column if not exists external_web_url text,
  add column if not exists external_filename text,
  add column if not exists external_size_bytes bigint,
  add column if not exists external_modified_at timestamptz;
