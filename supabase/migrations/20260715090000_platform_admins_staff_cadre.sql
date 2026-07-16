-- Creator Console "Platform Staff" feature: lets an existing platform
-- admin add staff, categorized by cadre (developer/accounts/admin), each
-- getting their own login with cadre-scoped access to the Creator Console.
--
-- platform_admins predates this repo's migration history (like
-- organizations/users) and already has id/user_id/email/role/added_by/
-- created_at, verified against the live schema before writing this rather
-- than assumed. A platform_admins row already IS the staff record and IS
-- the access grant, so this adds staff-management columns directly to it
-- rather than introducing a parallel table.
alter table public.platform_admins add column if not exists full_name text;
alter table public.platform_admins add column if not exists nickname text;
alter table public.platform_admins add column if not exists status text not null default 'active' check (status in ('active', 'inactive'));

-- `role` is intentionally left unconstrained by this migration: the two
-- existing rows use 'creator' (a legacy full-access tier that predates
-- cadres and must keep working unchanged), while staff added going
-- forward via this feature use 'admin' | 'accounts' | 'developer'. The
-- fixed set of new values, and what each can access, is enforced in
-- application code (src/lib/creator-permissions.ts), not a DB constraint
-- — adding a CHECK here would either break the existing 'creator' rows or
-- require silently rewriting them, neither of which this migration does.
