-- Security Stage 6: gate account/organization creation on accepting the
-- User Agreement (including the Security Guaranty). Acceptance is
-- recorded as a security_audit_log event, same as every other
-- compliance-relevant event in this app -- no new table needed.
alter table public.security_audit_log drop constraint if exists security_audit_log_event_type_check;
alter table public.security_audit_log add constraint security_audit_log_event_type_check
  check (event_type in (
    'login_success', 'login_failure', 'logout',
    'password_reset_requested', 'password_reset_completed',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'session_revoked', 'mfa_enrolled', 'mfa_reset',
    'terms_accepted'
  ));
