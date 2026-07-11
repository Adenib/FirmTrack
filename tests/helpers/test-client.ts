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

  const authedFetch = (path: string, init: RequestInit = {}) =>
    fetch(`${APP_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {}),
        cookie: cookieHeader,
      },
    })

  return { tenantId, userId, email, fetch: authedFetch }
}

// Explicit ordered delete by tenant_id across every table, rather than
// relying solely on `on delete cascade` from organizations — the
// pre-migration tables (matters, clients, time_entries, lawyers) predate
// this repo's migration history and their cascade behavior isn't confirmed.
export async function destroyTestTenant(tenant: { tenantId: string; userId: string }) {
  const { tenantId, userId } = tenant

  const tablesInOrder = [
    'journal_lines',
    'journal_entries',
    'accounting_periods',
    'budgets',
    'invoices',
    'disbursements',
    'trust_ledger_entries',
    'chart_of_accounts',
    'time_entries',
    'activity_log',
    'agent_api_keys',
    'accounts_staff',
    'accounts_categories',
    'lawyer_rates',
    'lawyers',
    'lawyer_categories',
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
}

export async function createTestClient(tenant: TestTenant, name: string) {
  const res = await tenant.fetch('/api/admin/clients', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Failed to create test client: ${body.error}`)
  return body.client
}

export async function createTestMatter(tenant: TestTenant, clientId: string, caseName: string) {
  const res = await tenant.fetch('/api/admin/matters', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, case_name: caseName }),
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
