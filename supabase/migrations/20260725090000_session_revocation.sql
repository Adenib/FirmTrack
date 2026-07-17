-- Security Stage 3: session revocation. A marker, not a per-session
-- table -- this app doesn't track individual sessions anywhere today,
-- and "any token issued before this moment is invalid" is sufficient for
-- "sign out everywhere" without one. Checked in middleware.ts against
-- each request's JWT `iat` claim, since Supabase's own admin ban API was
-- empirically confirmed (against this project's live instance) to NOT
-- invalidate an already-issued access token -- only refresh is blocked.
alter table public.users add column if not exists sessions_revoked_at timestamptz;

alter table public.security_audit_log drop constraint if exists security_audit_log_event_type_check;
alter table public.security_audit_log add constraint security_audit_log_event_type_check
  check (event_type in (
    'login_success', 'login_failure', 'logout',
    'password_reset_requested', 'password_reset_completed',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'session_revoked'
  ));
