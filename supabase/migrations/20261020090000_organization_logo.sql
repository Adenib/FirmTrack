-- Per-tenant logo, uploaded from Admin -> Organization Branding. logo_path
-- is the exact storage object path (not a public URL -- same "serve via
-- signed URL, never a bare storage URL" convention as every other bucket
-- in this app) so a re-upload with a different file extension doesn't
-- leave the old object orphaned: the app looks up logo_path, deletes that
-- exact object if present, then uploads the new one and overwrites the
-- column.
alter table public.organizations add column if not exists logo_path text;

-- Private bucket, consistent with 'documents'/'agent-installers' -- no
-- direct public storage URL, always served through a short-lived signed
-- URL from an authenticated route.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', false)
on conflict (id) do nothing;
