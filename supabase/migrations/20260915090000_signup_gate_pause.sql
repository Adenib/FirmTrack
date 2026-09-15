-- Lets Creator Console staff pause the new-signup approval gate: while
-- paused, a new firm's org is activated immediately at registration
-- instead of landing in the pending-approval queue. Already-pending
-- orgs from before the pause are untouched -- they still need manual
-- approval/rejection as normal; this only changes what happens for
-- registrations that occur while the flag is on.
--
-- Reuses the pre-existing platform_settings key-value table (same as
-- 'usd_ngn_rate'/'default_*_rate_usd') rather than a new table.
insert into platform_settings (key, value, description)
values ('signup_gate_paused', 'false', 'When true, new firm signups are auto-approved instead of requiring Creator Console approval.')
on conflict (key) do nothing;

-- Widen security_audit_log for the two new event types this toggle logs,
-- mirroring the user_deactivated/user_reactivated pairing. Re-specifies
-- the full known-good set from src/lib/audit-log.ts's SecurityEventType
-- union (a drop+add constraint replaces the whole list, not just adds
-- to it).
alter table public.security_audit_log drop constraint if exists security_audit_log_event_type_check;
alter table public.security_audit_log add constraint security_audit_log_event_type_check
  check (event_type in (
    'login_success', 'login_failure', 'logout',
    'password_reset_requested', 'password_reset_completed',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'session_revoked', 'mfa_enrolled', 'mfa_reset', 'terms_accepted',
    'signup_gate_paused', 'signup_gate_resumed'
  ));
