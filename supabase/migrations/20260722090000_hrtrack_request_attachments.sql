-- Evidence/proof attachments for requests (any of leave/redeployment/
-- grievance/exit -- unlike leave_allowance_amount this isn't leave-
-- specific, so it belongs on the shared table rather than in the
-- type-specific `details` payload).
--
-- One column, not three: path/filename/mime_type/size are always read and
-- written together, so a single jsonb column avoids three columns that
-- are meaningless independent of each other. Shape:
-- { path, filename, mime_type, size, uploaded_at }
alter table public.requests add column if not exists attachment jsonb;

-- Private bucket -- every read/write in this app goes through the
-- service-role client in an API route (never a direct browser-client
-- storage call), which already bypasses bucket-level RLS the same way it
-- bypasses table RLS elsewhere in this app. Visibility (including the
-- grievance-privacy rule) is enforced in application code in
-- src/app/api/hrtrack/requests/attachment/route.ts, and downloads are
-- served via short-lived signed URLs -- so no storage.objects RLS policy
-- is needed for a bucket nothing ever reads unsigned or client-side.
insert into storage.buckets (id, name, public)
values ('request-attachments', 'request-attachments', false)
on conflict (id) do nothing;
