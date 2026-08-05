// The single source of truth for "what tenant data exists and how it's
// related" -- used by both backup (export) and restore (import). Table
// order matches tests/helpers/test-client.ts's destroyTestTenant cleanup
// list, REVERSED (that list is children-first for delete; restore needs
// parents-first for insert), plus two tables that list omits
// (task_codes, ft_calendar_events) and document_versions/document_events
// (deliberately absent from the delete list since cascade handles them on
// delete, but restore has no cascade on create and must insert them
// explicitly).
//
// Deliberately excluded (not backed up/restored at all): microsoft_graph_tokens
// (OAuth refresh tokens -- meaningless across a restore, users just
// reconnect), agent_api_keys (desktop-agent keys tied to old installs),
// mfa_backup_codes (hashed one-time codes tied to an old MFA enrollment
// that won't exist on a freshly-created restored user anyway).

export type TableConfig = {
  name: string
  // Most tables have their own uuid `id` primary key that gets a fresh
  // uuid on restore. billtrack_settings/doctrack_settings use tenant_id
  // itself as the primary key -- no separate id column to remap.
  idColumn: 'id' | null
  // Whether rows are found by a direct tenant_id column (the default) or
  // indirectly via a parent table's already-restored id set (only
  // document_versions needs this -- it has no tenant_id column at all).
  scope?: { via: string; parentIdColumn: string }
  // column name -> name of the table (already earlier in RESTORE_ORDER,
  // or 'users'/'organizations') whose id map remaps this column's value.
  fkColumns?: Record<string, string>
  // Same idea, but the column holds an array of ids rather than one.
  arrayFkColumns?: Record<string, string>
}

export const RESTORE_ORDER: TableConfig[] = [
  { name: 'clients', idColumn: 'id' },
  { name: 'subscriptions', idColumn: 'id' },
  { name: 'accounttrack_currency_settings', idColumn: null, fkColumns: { enabled_by: 'users' } },
  { name: 'accounttrack_exchange_rates', idColumn: 'id', fkColumns: { created_by: 'users' } },
  { name: 'lawyer_categories', idColumn: 'id' },
  { name: 'lawyers', idColumn: 'id', fkColumns: { user_id: 'users', category_id: 'lawyer_categories' } },
  { name: 'lawyer_rates', idColumn: 'id', fkColumns: { lawyer_id: 'lawyers' } },
  { name: 'accounts_categories', idColumn: 'id' },
  { name: 'accounts_staff', idColumn: 'id', fkColumns: { user_id: 'users', category_id: 'accounts_categories' } },
  { name: 'task_codes', idColumn: 'id' },
  { name: 'ft_calendar_events', idColumn: 'id', fkColumns: { created_by: 'users', assigned_to: 'users' } },
  {
    name: 'matters',
    idColumn: 'id',
    fkColumns: { client_id: 'clients', responsible_lawyer: 'users', assigned_lawyer: 'users', rate_approved_by: 'users' },
    arrayFkColumns: { other_staff: 'users' },
  },
  { name: 'conflict_checks', idColumn: 'id', fkColumns: { matter_id: 'matters', searched_by: 'users' } },
  { name: 'documents', idColumn: 'id', fkColumns: { matter_id: 'matters', created_by: 'users' } },
  {
    name: 'document_versions',
    idColumn: 'id',
    scope: { via: 'documents', parentIdColumn: 'document_id' },
    fkColumns: { document_id: 'documents', uploaded_by: 'users' },
  },
  { name: 'document_events', idColumn: 'id', fkColumns: { document_id: 'documents', user_id: 'users' } },
  { name: 'chart_of_accounts', idColumn: 'id' },
  { name: 'journal_entries', idColumn: 'id', fkColumns: { created_by: 'users' } },
  {
    name: 'journal_lines',
    idColumn: 'id',
    fkColumns: { journal_entry_id: 'journal_entries', account_id: 'chart_of_accounts', matter_id: 'matters', lawyer_id: 'lawyers' },
  },
  { name: 'accounting_periods', idColumn: 'id', fkColumns: { closed_by: 'users', closing_entry_id: 'journal_entries' } },
  { name: 'invoices', idColumn: 'id', fkColumns: { matter_id: 'matters', created_by: 'users', reminders_paused_by: 'users' } },
  { name: 'disbursements', idColumn: 'id', fkColumns: { matter_id: 'matters', lawyer_id: 'lawyers', invoice_id: 'invoices', created_by: 'users' } },
  { name: 'trust_ledger_entries', idColumn: 'id', fkColumns: { matter_id: 'matters', created_by: 'users' } },
  { name: 'invoice_reminders', idColumn: 'id', fkColumns: { invoice_id: 'invoices' } },
  { name: 'billtrack_settings', idColumn: null },
  { name: 'doctrack_settings', idColumn: null },
  {
    name: 'time_entries',
    idColumn: 'id',
    fkColumns: { lawyer_id: 'lawyers', matter_id: 'matters', task_code_id: 'task_codes', created_by: 'users', invoice_id: 'invoices', calendar_event_id: 'ft_calendar_events' },
  },
  { name: 'activity_log', idColumn: 'id', fkColumns: { user_id: 'users', converted_to_entry_id: 'time_entries' } },
  { name: 'budgets', idColumn: 'id', fkColumns: { lawyer_id: 'lawyers', matter_id: 'matters', created_by: 'users' } },
  { name: 'payroll_salaries', idColumn: 'id', fkColumns: { user_id: 'users', created_by: 'users' } },
  { name: 'payroll_runs', idColumn: 'id', fkColumns: { created_by: 'users', posted_by: 'users' } },
  { name: 'payroll_line_items', idColumn: 'id', fkColumns: { payroll_run_id: 'payroll_runs', user_id: 'users' } },
  { name: 'leave_types', idColumn: 'id' },
  { name: 'requests', idColumn: 'id', fkColumns: { user_id: 'users', reviewed_by: 'users', paid_in_payroll_run_id: 'payroll_runs' } },
  { name: 'tasks', idColumn: 'id', fkColumns: { created_by: 'users', assigned_to: 'users' } },
  { name: 'performance_evaluations', idColumn: 'id', fkColumns: { staff_user_id: 'users', reviewer_user_id: 'users' } },
  { name: 'office_locations', idColumn: 'id' },
  { name: 'attendance_records', idColumn: 'id', fkColumns: { user_id: 'users' } },
  { name: 'security_audit_log', idColumn: 'id', fkColumns: { user_id: 'users' } },
]

// journal_entries.source_id and ft_calendar_events.linked_id are
// polymorphic (their target table depends on a sibling column,
// source_type/linked_module) and neither has a real DB-level FK
// constraint -- left unmapped on restore (historical/informational only,
// won't fail an insert) rather than special-cased per source/module type.
