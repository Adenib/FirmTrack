-- Security Stage 4: MFA (TOTP). Required by default per tenant, with an
-- owner/admin toggle -- groundwork for Stage 5 (Microsoft/Google SSO),
-- where a tenant whose IdP already enforces MFA via Conditional Access
-- can turn FirmTrack's own requirement off.
alter table public.organizations add column if not exists mfa_required boolean not null default true;

-- Backup codes are only issued to owner/admin (everyone else relies on
-- an admin-assisted reset). No select policy at all -- RLS enabled with
-- zero policies means nobody can read raw hashes via a browser client
-- even in principle; redemption is a service-role-only hash comparison
-- in the API route.
create table public.mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mfa_backup_codes_user_idx on public.mfa_backup_codes (user_id);
alter table public.mfa_backup_codes enable row level security;

alter table public.security_audit_log drop constraint if exists security_audit_log_event_type_check;
alter table public.security_audit_log add constraint security_audit_log_event_type_check
  check (event_type in (
    'login_success', 'login_failure', 'logout',
    'password_reset_requested', 'password_reset_completed',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'session_revoked', 'mfa_enrolled', 'mfa_reset'
  ));
