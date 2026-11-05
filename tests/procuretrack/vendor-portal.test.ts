import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import {
  createTestTenant, createTestUser, destroyTestTenant, createTestVendorPortalUser, destroyTestVendorPortalUser,
  supabaseAdmin, type TestTenant, type TestVendorPortalUser,
} from '../helpers/test-client'

describe('ProcureTrack vendor portal', () => {
  let tenant: TestTenant
  let staff: TestTenant
  let vendorAId: string
  let vendorBId: string
  let vendorAPortal: TestVendorPortalUser
  let rfqId: string

  beforeAll(async () => {
    tenant = await createTestTenant('ProcureTrackVendorPortal')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'procuretrack', tier: 'free', is_active: true, price_per_user: 0,
    })
    staff = await createTestUser(tenant, { role: 'staff' })

    const vA = await tenant.fetch('/api/procuretrack/vendors', { method: 'POST', body: JSON.stringify({ name: 'Vendor A' }) })
    vendorAId = (await vA.json()).vendor.id
    const vB = await tenant.fetch('/api/procuretrack/vendors', { method: 'POST', body: JSON.stringify({ name: 'Vendor B' }) })
    vendorBId = (await vB.json()).vendor.id

    vendorAPortal = await createTestVendorPortalUser(tenant, vendorAId)

    // Raised by `staff`, approved by the owner -- the requester can never
    // decide their own requisition.
    const reqRes = await staff.fetch('/api/procuretrack/requisitions', {
      method: 'POST', body: JSON.stringify({ item_description: 'Bulk printer toner', quantity: 20, estimated_unit_cost: 15000 }),
    })
    const requisitionId = (await reqRes.json()).requisition.id
    const { data: approval } = await supabaseAdmin.from('procuretrack_approvals').select('id').eq('requisition_id', requisitionId).single()
    await tenant.fetch('/api/procuretrack/approvals', { method: 'PATCH', body: JSON.stringify({ id: approval!.id, status: 'approved' }) })

    const rfqRes = await tenant.fetch('/api/procuretrack/rfqs', {
      method: 'POST', body: JSON.stringify({ requisition_id: requisitionId, title: 'Toner RFQ', vendor_ids: [vendorAId] }),
    })
    rfqId = (await rfqRes.json()).rfq.id
  })

  afterAll(async () => {
    await destroyTestVendorPortalUser(vendorAPortal)
    await destroyTestTenant(tenant, [staff.userId])
  })

  it('an invited vendor sees their own RFQ invitation through the portal', async () => {
    const res = await vendorAPortal.fetch('/api/procuretrack/portal/rfqs')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invitations.some((i: { rfq: { id: string } }) => i.rfq.id === rfqId)).toBe(true)
  })

  it('the vendor can submit their own quote on the RFQ they were invited to', async () => {
    const res = await vendorAPortal.fetch('/api/procuretrack/portal/quotes', {
      method: 'POST', body: JSON.stringify({ rfq_id: rfqId, unit_price: 14500, quantity: 20 }),
    })
    expect(res.status).toBe(201)
    const quote = (await res.json()).quote
    expect(quote.vendor_id).toBe(vendorAId)
  })

  it('a vendor cannot submit a quote on an RFQ they were never invited to', async () => {
    const reqRes = await staff.fetch('/api/procuretrack/requisitions', {
      method: 'POST', body: JSON.stringify({ item_description: 'Something else', quantity: 1, estimated_unit_cost: 1000 }),
    })
    const otherRequisitionId = (await reqRes.json()).requisition.id
    const { data: approval } = await supabaseAdmin.from('procuretrack_approvals').select('id').eq('requisition_id', otherRequisitionId).single()
    await tenant.fetch('/api/procuretrack/approvals', { method: 'PATCH', body: JSON.stringify({ id: approval!.id, status: 'approved' }) })

    const otherRfqRes = await tenant.fetch('/api/procuretrack/rfqs', {
      method: 'POST',
      body: JSON.stringify({ requisition_id: otherRequisitionId, title: 'Not for vendor A', vendor_ids: [vendorBId] }),
    })
    const otherRfqId = (await otherRfqRes.json()).rfq.id

    const res = await vendorAPortal.fetch('/api/procuretrack/portal/quotes', {
      method: 'POST', body: JSON.stringify({ rfq_id: otherRfqId, unit_price: 100, quantity: 1 }),
    })
    expect(res.status).toBe(403)
  })

  it("a vendor only sees their own POs, never another vendor's", async () => {
    const poRes = await tenant.fetch('/api/procuretrack/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({ vendor_id: vendorBId, lines: [{ description: 'Something for vendor B', quantity: 1, unit_price: 5000 }] }),
    })
    expect(poRes.status).toBe(201)

    const myPos = await vendorAPortal.fetch('/api/procuretrack/portal/purchase-orders')
    const body = await myPos.json()
    expect(body.purchaseOrders).toEqual([])
  })

  it("a vendor can upload their invoice against their own PO", async () => {
    const poRes = await tenant.fetch('/api/procuretrack/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({ vendor_id: vendorAId, lines: [{ description: 'Toner', quantity: 20, unit_price: 14500 }] }),
    })
    const po = (await poRes.json()).po

    const formData = new FormData()
    formData.append('po_id', po.id)
    formData.append('invoice_number', 'VENDOR-INV-001')
    formData.append('invoice_date', '2026-11-05')
    formData.append('total_amount', '290000')

    const res = await vendorAPortal.fetch('/api/procuretrack/portal/invoices', { method: 'POST', body: formData })
    expect(res.status).toBe(201)
    const invoice = (await res.json()).invoice
    expect(invoice.status).toBe('pending_match')
    expect(Number(invoice.total_amount)).toBe(290000)
  })

  it('an unauthenticated caller gets 401 from every portal route', async () => {
    const res = await fetch('http://localhost:3000/api/procuretrack/portal/purchase-orders')
    expect(res.status).toBe(401)
  })
})
