import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, getChartOfAccounts, type TestTenant } from '../helpers/test-client'

describe('cash/bank account flag', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant('CashAccounts')
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  it('defaults seed is_cash_account=true only for operating_cash and trust_bank', async () => {
    const accounts = await getChartOfAccounts(tenant)
    const cashKeys = accounts.filter((a: any) => a.is_cash_account).map((a) => a.key)
    expect(new Set(cashKeys)).toEqual(new Set(['operating_cash', 'trust_bank']))
  })

  it('can create a custom asset account flagged as a cash account', async () => {
    const res = await tenant.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Petty Cash - Lagos', account_type: 'asset', is_cash_account: true }),
    })
    expect(res.status).toBe(200)
    const { account } = await res.json()
    expect(account.is_cash_account).toBe(true)
  })

  it('rejects is_cash_account on a non-asset account type', async () => {
    const res = await tenant.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Not Cash', account_type: 'expense', is_cash_account: true }),
    })
    expect(res.status).toBe(400)
  })

  it('?cash_only=1 returns only flagged accounts', async () => {
    const res = await tenant.fetch('/api/accounttrack/chart-of-accounts?cash_only=1')
    expect(res.status).toBe(200)
    const { accounts } = await res.json()
    expect(accounts.length).toBeGreaterThanOrEqual(3) // operating_cash, trust_bank, Petty Cash - Lagos
    for (const a of accounts) expect(a.is_cash_account).toBe(true)
  })

  it('PATCH can toggle the flag on an existing custom account, and rejects it on a liability account', async () => {
    const createRes = await tenant.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Toggle Test', account_type: 'asset' }),
    })
    const { account } = await createRes.json()
    expect(account.is_cash_account).toBe(false)

    const patchRes = await tenant.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ id: account.id, is_cash_account: true }),
    })
    expect(patchRes.status).toBe(200)
    const patched = await patchRes.json()
    expect(patched.account.is_cash_account).toBe(true)

    const accounts = await getChartOfAccounts(tenant)
    const liabilityAccount = accounts.find((a: any) => a.key === 'trust_liability')!
    const badPatchRes = await tenant.fetch('/api/accounttrack/chart-of-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ id: liabilityAccount.id, is_cash_account: true }),
    })
    expect(badPatchRes.status).toBe(400)
  })
})
