import { createClient } from '@supabase/supabase-js'

const APP_URL = 'http://localhost:3000'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type TestTenant = {
  tenantId: string
  userId: string
  email: string
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}

function extractCookieHeader(res: Response): string {
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : []
  return setCookies.map((c) => c.split(';')[0]).join('; ')
}

async function loginAs(email: string, password: string) {
  const loginRes = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!loginRes.ok) {
    throw new Error(`Failed to log in test user: ${JSON.stringify(await loginRes.json())}`)
  }
  const cookieHeader = extractCookieHeader(loginRes)
  if (!cookieHeader) {
    throw new Error('Login succeeded but no session cookie was returned')
  }

  return (path: string, init: RequestInit = {}) =>
    fetch(`${APP_URL}${path}`, {
      ...init,
      headers: {
        // A FormData body needs fetch to compute its own multipart
        // boundary in the content-type header -- forcing json here would
        // break every attachment-upload test.
        ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...(init.headers || {}),
        cookie: cookieHeader,
      },
    })
}

// Registers a brand-new throwaway tenant (own org, own auth user) via the
// same routes a real signup uses, so tests exercise real code paths rather
// than inserting fixture rows directly. Each test FILE should call this
// once in beforeAll and destroyTestTenant in afterAll — full isolation,
// no dependency on or pollution of any pre-existing tenant's data.
export async function createTestTenant(namePrefix: string): Promise<TestTenant> {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `test-${uniqueId}@firmtrack-test.local`
  const password = 'TestPassword123!'
  const orgName = `${namePrefix} ${uniqueId}`

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError || !authUser.user) {
    throw new Error(`Failed to create test auth user: ${authError?.message}`)
  }
  const userId = authUser.user.id

  const registerRes = await fetch(`${APP_URL}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, email, orgName }),
  })
  const registerBody = await registerRes.json()
  if (!registerRes.ok) {
    throw new Error(`Failed to register test tenant: ${registerBody.error}`)
  }
  const tenantId = registerBody.organizationId

  // /api/register only grants the free-tier modules — accounttrack isn't
  // one of them, so every AccountTrack write route's hasActiveModule()
  // check would 403 without this.
  await supabaseAdmin.from('subscriptions').insert({
    tenant_id: tenantId,
    module: 'accounttrack',
    tier: 'free',
    is_active: true,
    price_per_user: 0,
  })

  const authedFetch = await loginAs(email, password)

  return { tenantId, userId, email, fetch: authedFetch }
}

// Creates an additional user in an existing tenant (owner/admin-only route,
// so must be called with an already-privileged tenant.fetch) and logs them
// in, returning their own authenticated fetch — for tests that need to
// exercise permission checks as a specific non-owner role.
export async function createTestUser(
  tenant: TestTenant,
  opts: { role: string }
): Promise<TestTenant> {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `test-${opts.role}-${uniqueId}@firmtrack-test.local`
  const password = 'TestPassword123!'

  const res = await tenant.fetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, role: opts.role, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Failed to create test user: ${body.error}`)

  const authedFetch = await loginAs(email, password)
  return { tenantId: tenant.tenantId, userId: body.userId, email, fetch: authedFetch }
}

// Explicit ordered delete by tenant_id across every table, rather than
// relying solely on `on delete cascade` from organizations — the
// pre-migration tables (matters, clients, time_entries, lawyers) predate
// this repo's migration history and their cascade behavior isn't confirmed.
// Attachments live under request-attachments/{tenantId}/{requestId}/{file}
// -- storage.list() is one level at a time, so the requestId subfolders
// have to be listed before their files can be removed.
async function destroyTestAttachments(tenantId: string) {
  const { data: requestDirs } = await supabaseAdmin.storage.from('request-attachments').list(tenantId)
  for (const dir of requestDirs || []) {
    const { data: files } = await supabaseAdmin.storage.from('request-attachments').list(`${tenantId}/${dir.name}`)
    const paths = (files || []).map((f) => `${tenantId}/${dir.name}/${f.name}`)
    if (paths.length) await supabaseAdmin.storage.from('request-attachments').remove(paths)
  }
}

export async function destroyTestTenant(tenant: { tenantId: string; userId: string }, extraUserIds: string[] = []) {
  const { tenantId, userId } = tenant

  await destroyTestAttachments(tenantId)

  const tablesInOrder = [
    'invoice_reminders',
    'billtrack_settings',
    'attendance_records',
    'office_locations',
    'performance_evaluations',
    'tasks',
    'requests',
    'leave_types',
    'journal_lines',
    'journal_entries',
    'accounting_periods',
    'budgets',
    // activity_log.converted_to_entry_id -> time_entries, and
    // time_entries.invoice_id / disbursements.invoice_id -> invoices, so
    // both must be deleted before the tables they reference or the
    // FK-constrained delete on the parent silently fails (no cascade on
    // either FK) and leaves orphaned rows.
    'activity_log',
    'time_entries',
    'disbursements',
    'invoices',
    'trust_ledger_entries',
    'chart_of_accounts',
    'agent_api_keys',
    'accounts_staff',
    'accounts_categories',
    'lawyer_rates',
    'lawyers',
    'lawyer_categories',
    'conflict_checks',
    'matters',
    'clients',
    'subscriptions',
    'users',
    'organizations',
  ]

  for (const table of tablesInOrder) {
    await supabaseAdmin.from(table).delete().eq(table === 'organizations' ? 'id' : 'tenant_id', tenantId)
  }

  await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
  for (const extraId of extraUserIds) {
    await supabaseAdmin.auth.admin.deleteUser(extraId).catch(() => {})
  }
}

export async function createTestClient(tenant: TestTenant, name: string, opts: { email?: string } = {}) {
  const res = await tenant.fetch('/api/admin/clients', {
    method: 'POST',
    body: JSON.stringify({ name, email: opts.email }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Failed to create test client: ${body.error}`)
  return body.client
}

export async function createTestMatter(
  tenant: TestTenant,
  clientId: string,
  caseName: string,
  opts: { responsible_lawyer?: string } = {}
) {
  const res = await tenant.fetch('/api/admin/matters', {
    method: 'POST',
    body: JSON.stringify({
      client_id: clientId,
      case_name: caseName,
      responsible_lawyer: opts.responsible_lawyer,
      // Matter creation requires a confirmed conflict-of-interest check —
      // tests aren't exercising that feature here, so satisfy it the same
      // way a real "ran the search, found nothing, confirmed" flow would.
      conflict_search_terms: [caseName],
      conflict_search_confirmed: true,
      conflict_search_results: { terms: [caseName], clients: [], matters: [], timeEntries: [] },
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Failed to create test matter: ${body.error}`)
  return body.matter
}

export async function createTestLawyer(tenant: TestTenant, opts: { nickname: string; initials: string }) {
  const res = await tenant.fetch('/api/admin/lawyers', {
    method: 'POST',
    body: JSON.stringify({
      user_id: tenant.userId,
      full_name: opts.nickname,
      nickname: opts.nickname,
      initials: opts.initials,
      status: 'active',
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Failed to create test lawyer: ${body.error}`)
  return body.lawyer
}

export async function getChartOfAccounts(tenant: TestTenant) {
  const res = await tenant.fetch('/api/accounttrack/chart-of-accounts')
  const body = await res.json()
  if (!res.ok) throw new Error(`Failed to fetch chart of accounts: ${body.error}`)
  return body.accounts as { id: string; key: string | null; code: string; name: string; account_type: string }[]
}
