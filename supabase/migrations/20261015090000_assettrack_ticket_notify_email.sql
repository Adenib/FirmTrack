-- Optional override for where ticket-status-update emails go -- defaults
-- to the reporter's own FirmTrack account email when null, but lets the
-- submission form offer a contact address up front (e.g. if the asset's
-- assignee wasn't resolved to a FirmTrack account, or someone is
-- reporting on another person's behalf).
alter table public.assettrack_tickets add column if not exists notify_email text;
