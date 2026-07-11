-- Follow-up to 20260710110000_fix_time_entries_legacy_schema.sql.
--
-- Caught by end-to-end testing: the legacy time_entries table had NOT NULL
-- constraints (no defaults) on `user_id`, `matter`, and `hours` — columns
-- the current app code (src/app/api/timetrack/entries/route.ts) never
-- populates, since it writes `created_by`/`matter_id`/optional `hours`
-- instead. Every insert was failing with "null value in column user_id
-- violates not-null constraint". Relaxing these to nullable rather than
-- backfilling them on every insert, since they're legacy/superseded
-- columns kept only for old-data continuity, not new writes.

alter table public.time_entries alter column user_id drop not null;
alter table public.time_entries alter column matter drop not null;
alter table public.time_entries alter column hours drop not null;
