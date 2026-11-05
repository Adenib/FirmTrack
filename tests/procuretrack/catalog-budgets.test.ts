import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, destroyTestTenant, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('ProcureTrack: catalog, inventory link, low-stock auto-PR, and department budgets', () => {
  let tenant: TestTenant
  let vendorId: string
  let departmentId: string

  beforeAll(async () => {
    tenant = await createTestTenant('ProcureTrackCatalogBudgets')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'procuretrack', tier: 'free', is_active: true, price_per_user: 0,
    })
    const vendorRes = await tenant.fetch('/api/procuretrack/vendors', { method: 'POST', body: JSON.stringify({ name: 'Paper Co' }) })
    vendorId = (await vendorRes.json()).vendor.id
    const deptRes = await tenant.fetch('/api/procuretrack/departments', { method: 'POST', body: JSON.stringify({ name: 'Admin' }) })
    departmentId = (await deptRes.json()).department.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant)
  })

  let catalogItemId: string
  let poId: string
  let poLineId: string

  it('creates a tracked-inventory catalog item with a reorder point', async () => {
    const res = await tenant.fetch('/api/procuretrack/catalog', {
      method: 'POST',
      body: JSON.stringify({
        name: 'A4 Paper Ream', unit_price: 2500, track_inventory: true, reorder_point: 20, preferred_vendor_id: vendorId,
      }),
    })
    expect(res.status).toBe(201)
    const item = (await res.json()).item
    catalogItemId = item.id
    expect(Number(item.on_hand_quantity)).toBe(0)
  })

  it('a PO against the catalog item, then a goods receipt, bumps on_hand_quantity', async () => {
    const poRes = await tenant.fetch('/api/procuretrack/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        vendor_id: vendorId, department_id: departmentId,
        lines: [{ catalog_item_id: catalogItemId, description: 'A4 Paper Ream', quantity: 50, unit_price: 2500 }],
      }),
    })
    expect(poRes.status).toBe(201)
    const po = (await poRes.json()).po
    poId = po.id
    expect(Number(po.total_amount)).toBe(125000)

    const { data: lines } = await supabaseAdmin.from('procuretrack_po_lines').select('*').eq('po_id', poId)
    poLineId = lines![0].id

    const grnRes = await tenant.fetch('/api/procuretrack/goods-receipts', {
      method: 'POST',
      body: JSON.stringify({ po_id: poId, lines: [{ po_line_id: poLineId, quantity_received: 50 }] }),
    })
    expect(grnRes.status).toBe(201)

    const { data: item } = await supabaseAdmin.from('procuretrack_catalog_items').select('on_hand_quantity').eq('id', catalogItemId).single()
    expect(Number(item!.on_hand_quantity)).toBe(50)
  })

  it('a second PO/GRN that drops on_hand below reorder_point auto-creates a draft requisition (never auto-submitted)', async () => {
    const poRes = await tenant.fetch('/api/procuretrack/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        vendor_id: vendorId,
        lines: [{ catalog_item_id: catalogItemId, description: 'A4 Paper Ream (consumption placeholder)', quantity: 1, unit_price: 2500 }],
      }),
    })
    const po2 = (await poRes.json()).po
    const { data: lines2 } = await supabaseAdmin.from('procuretrack_po_lines').select('*').eq('po_id', po2.id)

    // Simulate heavy consumption by directly lowering on_hand_quantity
    // below the reorder point, then receive one more unit through the
    // real route so the low-stock check actually runs against real data.
    await supabaseAdmin.from('procuretrack_catalog_items').update({ on_hand_quantity: 15 }).eq('id', catalogItemId)

    const grnRes = await tenant.fetch('/api/procuretrack/goods-receipts', {
      method: 'POST',
      body: JSON.stringify({ po_id: po2.id, lines: [{ po_line_id: lines2![0].id, quantity_received: 1 }] }),
    })
    expect(grnRes.status).toBe(201)

    const { data: autoReqs } = await supabaseAdmin
      .from('procuretrack_requisitions')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .eq('catalog_item_id', catalogItemId)
      .eq('auto_generated', true)
    expect(autoReqs!.length).toBe(1)
    expect(autoReqs![0].status).toBe('draft')
  })

  it('a department budget reports committed spend (open PO) and remaining budget correctly', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const budgetRes = await tenant.fetch('/api/procuretrack/budgets', {
      method: 'POST',
      body: JSON.stringify({ department_id: departmentId, period_start: today, period_end: nextYear, amount: 500000 }),
    })
    expect(budgetRes.status).toBe(201)

    const listRes = await tenant.fetch(`/api/procuretrack/budgets?department_id=${departmentId}`)
    const body = await listRes.json()
    const budget = body.budgets[0]
    expect(budget.usage.budgeted).toBe(500000)
    // committed = the first PO (125000), raised against this department --
    // the second PO above had no department_id, so it's excluded.
    expect(budget.usage.committed).toBe(125000)
    expect(budget.usage.remaining).toBe(375000)
  })
})
