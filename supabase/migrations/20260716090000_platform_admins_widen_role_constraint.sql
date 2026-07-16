-- Fixes a gap in 20260715090000_platform_admins_staff_cadre.sql: that
-- migration assumed platform_admins.role was unconstrained ("enforced in
-- application code, not a DB constraint"), but a pre-existing CHECK
-- constraint (platform_admins_role_check, predating this repo's migration
-- history like the rest of the table) only permits 'creator' and 'staff'
-- — silently rejecting every 'admin'/'accounts'/'developer' insert the
-- new Platform Staff feature depends on. Found via end-to-end testing,
-- not visible from the app code alone.
alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins add constraint platform_admins_role_check
  check (role in ('creator', 'staff', 'admin', 'accounts', 'developer'));
