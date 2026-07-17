-- Security Stage 1: audit log for login attempts, logouts, password
-- resets, and user-management actions. Foundation for the later security
-- stages -- rate limiting needs to know about failed attempts, session
-- revocation is more useful when an admin can see what looks suspicious.
create table public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Both nullable: a failed login against an email matching no account
  -- has neither.
  tenant_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id),
  event_type text not null check (event_type in (
    'login_success', 'login_failure', 'logout',
    'password_reset_requested', 'password_reset_completed',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated'
  )),
  -- Stored separately from metadata so a failed-login series against one
  -- target account is easy to query even when user_id can't be resolved.
  email text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index security_audit_log_tenant_created_idx on public.security_audit_log (tenant_id, created_at desc);
create index security_audit_log_tenant_type_idx on public.security_audit_log (tenant_id, event_type);

alter table public.security_audit_log enable row level security;
-- Owner/admin only -- a log entry has no natural "this is mine" owner
-- the way a payslip does, and this is more sensitive than anything else
-- in the app (literal IP addresses and login attempt history).
create policy "security_audit_log_select_privileged" on public.security_audit_log
  for select
  using (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
  );
