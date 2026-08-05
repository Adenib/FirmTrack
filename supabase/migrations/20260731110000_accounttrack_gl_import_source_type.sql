-- Widen journal_entries.source_type to allow a bulk legacy-ledger import,
-- distinguishing these from ordinary user-entered 'manual' entries in
-- reporting (e.g. so a firm's real transaction history migrated from a
-- prior accounting system can be filtered/identified separately later).
alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check check (source_type in (
  'invoice_created', 'invoice_payment', 'invoice_void', 'disbursement_recorded',
  'trust_deposit', 'trust_withdrawal', 'retainer_deposit', 'retainer_withdrawal',
  'manual', 'year_close', 'year_reopen', 'gl_import'
));
