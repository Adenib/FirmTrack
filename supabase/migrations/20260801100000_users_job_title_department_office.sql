-- Adds directory fields carried by a real staff import (e.g. from an M365
-- user export) that `users` had no place to store before -- previously
-- only the orphaned, unlinked `employees` table had these, which nothing
-- else in the app reads. Nullable: most existing users won't have these
-- set, and nothing requires them.
alter table public.users add column if not exists job_title text;
alter table public.users add column if not exists department text;
alter table public.users add column if not exists office text;
alter table public.users add column if not exists mobile_phone text;
alter table public.users add column if not exists phone_number text;
