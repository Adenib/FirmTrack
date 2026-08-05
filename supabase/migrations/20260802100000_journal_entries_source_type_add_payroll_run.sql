-- journal_entries_source_type_check never included 'payroll_run', even
-- though src/lib/hrtrack/payroll.ts's postPayrollRun() has been posting
-- with that source_type since HRTrack payroll shipped -- a pre-existing
-- schema/app drift (same class of bug as the earlier users_role_check
-- 'accounts' and subscriptions_module_check 'ai_support' gaps this
-- session), unrelated to today's currency-rename work. Confirmed via a
-- real failing test (posting a payroll run 500s with a real 23514
-- check-constraint violation), not assumed.
alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check check (source_type in (
  'invoice_created', 'invoice_payment', 'invoice_void', 'disbursement_recorded',
  'trust_deposit', 'trust_withdrawal', 'retainer_deposit', 'retainer_withdrawal',
  'manual', 'year_close', 'year_reopen', 'gl_import', 'payroll_run'
));
