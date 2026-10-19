import type { SupabaseClient } from '@supabase/supabase-js'

// Mirrors tests/helpers/test-client.ts's destroyTestTenant: an explicit
// ordered delete rather than relying on cascade behavior, since several of
// these tables predate this repo's migration history and some FKs are
// intentionally ON DELETE SET NULL (e.g. assettrack_tickets.asset_id) so a
// plain cascade from `organizations` would silently leave ticket history
// pointing at nothing deleted, while others simply don't cascade at all.
const TABLES_IN_ORDER = [
  'invoice_reminders',
  'billtrack_settings',
  'doctrack_settings',
  'attendance_records',
  'office_locations',
  'performance_evaluations',
  'tasks',
  'requests',
  'payroll_line_items',
  'payroll_runs',
  'payroll_salaries',
  'leave_types',
  'journal_lines',
  'journal_entries',
  'accounting_periods',
  'budgets',
  'activity_log',
  'time_entries',
  'disbursements',
  'invoices',
  'trust_ledger_entries',
  'chart_of_accounts',
  'security_audit_log',
  'ai_inbox_digest_runs',
  'ai_expert_agent_messages',
  'ai_expert_agents',
  'mfa_backup_codes',
  'agent_api_keys',
  'accounts_staff',
  'accounts_categories',
  'internal_cost_rates',
  'lawyer_rates',
  'lawyers',
  'lawyer_categories',
  'conflict_checks',
  'documents',
  'matters',
  'clients',
  'subscriptions',
  'recurring_transaction_templates',
  'assettrack_tickets',
  'assettrack_assets',
  'assettrack_sync_settings',
  'users',
]

const ATTACHMENT_BUCKETS = ['request-attachments', 'documents']

export type DeleteOrganizationResult = {
  tableErrors: { table: string; message: string }[]
  userDeleteErrors: { userId: string; message: string }[]
}

async function destroyAttachments(supabaseAdmin: SupabaseClient, tenantId: string, bucket: string) {
  const { data: dirs } = await supabaseAdmin.storage.from(bucket).list(tenantId)
  for (const dir of dirs || []) {
    const { data: files } = await supabaseAdmin.storage.from(bucket).list(`${tenantId}/${dir.name}`)
    const paths = (files || []).map((f) => `${tenantId}/${dir.name}/${f.name}`)
    if (paths.length) await supabaseAdmin.storage.from(bucket).remove(paths)
  }
}

// Deletes every row belonging to this organization across every known
// tenant-scoped table, its storage attachments, its auth users, and
// finally the organization row itself. Best-effort: a failure on one
// table/user doesn't abort the rest, and every failure is returned to the
// caller instead of being swallowed.
export async function deleteOrganization(
  supabaseAdmin: SupabaseClient,
  orgId: string
): Promise<DeleteOrganizationResult> {
  const result: DeleteOrganizationResult = { tableErrors: [], userDeleteErrors: [] }

  const { data: users } = await supabaseAdmin.from('users').select('id').eq('tenant_id', orgId)
  const userIds = (users || []).map((u) => u.id)

  for (const bucket of ATTACHMENT_BUCKETS) {
    await destroyAttachments(supabaseAdmin, orgId, bucket).catch((e: Error) => {
      result.tableErrors.push({ table: `storage(${bucket})`, message: e.message })
    })
  }

  for (const table of TABLES_IN_ORDER) {
    const { error } = await supabaseAdmin.from(table).delete().eq('tenant_id', orgId)
    if (error) result.tableErrors.push({ table, message: error.message })
  }

  for (const userId of userIds) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) result.userDeleteErrors.push({ userId, message: error.message })
  }

  const { error: orgError } = await supabaseAdmin.from('organizations').delete().eq('id', orgId)
  if (orgError) result.tableErrors.push({ table: 'organizations', message: orgError.message })

  return result
}
