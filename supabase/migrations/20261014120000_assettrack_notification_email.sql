-- Per-tenant recipient for "a ticket was submitted" notifications (e.g.
-- AELEX's it@aelex.com) -- kept on the same per-tenant AssetTrack
-- settings row as the SharePoint sync config, since this is general
-- AssetTrack configuration, not SharePoint-specific.
alter table public.assettrack_sync_settings add column if not exists notification_email text;
