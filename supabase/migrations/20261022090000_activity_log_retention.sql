-- Soft-delete column for the scheduled activity_log cleanup (cron:
-- timetrack-activity-retention). Matches DocTrack's own retention pattern
-- exactly (soft-delete, never hard-delete) -- the raw window-title/process
-- telemetry gets hidden from normal view once it's old AND already turned
-- into a real time entry, but the row itself stays in the database,
-- available for audit/compliance reference rather than destroyed.
alter table public.activity_log add column if not exists deleted_at timestamptz;

-- The cron job's own query shape: already-converted, not yet soft-deleted,
-- ordered by age.
create index if not exists activity_log_retention_idx
  on public.activity_log (converted_to_entry_id, logged_at)
  where deleted_at is null;
