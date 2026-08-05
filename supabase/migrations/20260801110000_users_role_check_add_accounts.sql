-- users_role_check predates this repo's migration history and never
-- included 'accounts', even though it's been a real, offered role in the
-- app (ASSIGNABLE_ROLES in /api/admin/users, the accounts_staff feature,
-- the role-change dropdown in the Users admin page) -- a schema/app drift
-- that silently 500'd any attempt to actually assign it. Confirmed via a
-- real test insert (23514) before writing this, not assumed.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in (
  'owner', 'admin', 'manager', 'accounts', 'staff'
));
