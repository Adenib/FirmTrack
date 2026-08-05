-- Adds 'hr' as a new role -- HRTrack's primary manager, requested alongside
-- the WFH activity-monitoring feature. Mirrors
-- 20260801110000_users_role_check_add_accounts.sql's exact pattern.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in (
  'owner', 'admin', 'manager', 'accounts', 'hr', 'staff'
));
