import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createTestTenant, createTestUser, destroyTestTenant, getChartOfAccounts, supabaseAdmin, type TestTenant } from '../helpers/test-client'

describe('ProcureTrack: vendor -> RFQ -> PO -> GRN -> invoice -> payment', () => {
  let tenant: TestTenant
  let accounts: TestTenant
  let vendorAId: string
  let vendorBId: string

  beforeAll(async () => {
    tenant = await createTestTenant('ProcureTrackPoFlow')
    await supabaseAdmin.from('subscriptions').insert({
      tenant_id: tenant.tenantId, module: 'procuretrack', tier: 'free', is_active: true, price_per_user: 0,
    })
    accounts = await createTestUser(tenant, { role: 'accounts' })

    const vA = await tenant.fetch('/api/procuretrack/vendors', { method: 'POST', body: JSON.stringify({ name: 'Acme Supplies', status: 'active' }) })
    vendorAId = (await vA.json()).vendor.id
    const vB = await tenant.fetch('/api/procuretrack/vendors', { method: 'POST', body: JSON.stringify({ name: 'Best Office Ltd', status: 'active' }) })
    vendorBId = (await vB.json()).vendor.id
  })

  afterAll(async () => {
    await destroyTestTenant(tenant, [accounts.userId])
  })

  it('accounts role cannot create a vendor (owner/admin/manager only)', async () => {
    const res = await accounts.fetch('/api/procuretrack/vendors', { method: 'POST', body: JSON.stringify({ name: 'Nope Ltd' }) })
    expect(res.status).toBe(403)
  })

  let requisitionId: string
  let rfqId: string
  let selectedQuoteId: string
  let poId: string
  let poLineId: string

  it('creates an approved requisition directly (bypassing the approval-rules flow for this test) to drive the RFQ', async () => {
    // Raised by `accounts`, approved by the owner -- segregation of duty
    // means the requester can never decide their own requisition, so the
    // requester here must be someone other than whoever approves it.
    const res = await accounts.fetch('/api/procuretrack/requisitions', {
      method: 'POST',
      body: JSON.stringify({ item_description: '10 office chairs', quantity: 10, estimated_unit_cost: 50000 }),
    })
    requisitionId = (await res.json()).requisition.id
    // No approval_rules configured in this tenant -> falls back to a
    // single 'owner' step; approve it directly as the owner.
    const { data: approval } = await supabaseAdmin.from('procuretrack_approvals').select('id').eq('requisition_id', requisitionId).single()
    const approveRes = await tenant.fetch('/api/procuretrack/approvals', { method: 'PATCH', body: JSON.stringify({ id: approval!.id, status: 'approved' }) })
    expect(approveRes.status).toBe(200)
  })

  it('creates an RFQ from the approved requisition and invites both vendors', async () => {
    const res = await tenant.fetch('/api/procuretrack/rfqs', {
      method: 'POST',
      body: JSON.stringify({ requisition_id: requisitionId, title: 'Office chairs RFQ', vendor_ids: [vendorAId, vendorBId] }),
    })
    expect(res.status).toBe(201)
    rfqId = (await res.json()).rfq.id

    const { data: requisition } = await supabaseAdmin.from('procuretrack_requisitions').select('status').eq('id', requisitionId).single()
    expect(requisition!.status).toBe('converted_to_rfq')
  })

  it('records two quotes and selects the cheaper one with a written reason', async () => {
    const quoteA = await tenant.fetch(`/api/procuretrack/rfqs/${rfqId}/quotes`, {
      method: 'POST', body: JSON.stringify({ vendor_id: vendorAId, unit_price: 48000, quantity: 10 }),
    })
    const quoteB = await tenant.fetch(`/api/procuretrack/rfqs/${rfqId}/quotes`, {
      method: 'POST', body: JSON.stringify({ vendor_id: vendorBId, unit_price: 52000, quantity: 10 }),
    })
    selectedQuoteId = (await quoteA.json()).quote.id
    await quoteB.json()

    const rejectNoReason = await tenant.fetch(`/api/procuretrack/rfqs/${rfqId}/quotes`, {
      method: 'PATCH', body: JSON.stringify({ quote_id: selectedQuoteId }),
    })
    expect(rejectNoReason.status).toBe(400)

    const select = await tenant.fetch(`/api/procuretrack/rfqs/${rfqId}/quotes`, {
      method: 'PATCH', body: JSON.stringify({ quote_id: selectedQuoteId, selection_reason: 'Lowest price, same spec' }),
    })
    expect(select.status).toBe(200)
    const body = await select.json()
    expect(body.rfq.status).toBe('awarded')
  })

  it('issues a PO from the awarded RFQ, carrying the selected vendor/price', async () => {
    const res = await tenant.fetch('/api/procuretrack/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({ rfq_id: rfqId }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    poId = body.po.id
    expect(body.po.vendor_id).toBe(vendorAId)
    expect(body.po.status).toBe('issued')
    expect(Number(body.po.total_amount)).toBe(480000)
    expect(body.po.po_number).toMatch(/^PO-\d{4}-\d{4}$/)

    const { data: requisition } = await supabaseAdmin.from('procuretrack_requisitions').select('status').eq('id', requisitionId).single()
    expect(requisition!.status).toBe('converted_to_po')

    const { data: lines } = await supabaseAdmin.from('procuretrack_po_lines').select('*').eq('po_id', poId)
    poLineId = lines![0].id
  })

  it('an amendment changes a PO field and is recorded, never edited in place silently', async () => {
    const res = await tenant.fetch(`/api/procuretrack/purchase-orders/${poId}/amendments`, {
      method: 'POST',
      body: JSON.stringify({ changes: { total_amount: 490000 }, reason: 'Vendor added a delivery surcharge' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.amendment.amendment_number).toBe(1)
    expect(Number(body.po.total_amount)).toBe(490000)
  })

  it('records a partial goods receipt, then completes it -- PO status tracks full/partial correctly', async () => {
    const partial = await tenant.fetch('/api/procuretrack/goods-receipts', {
      method: 'POST',
      body: JSON.stringify({ po_id: poId, lines: [{ po_line_id: poLineId, quantity_received: 6 }] }),
    })
    expect(partial.status).toBe(201)
    expect((await partial.json()).receipt.status).toBe('partial')

    const { data: afterPartial } = await supabaseAdmin.from('procuretrack_purchase_orders').select('status').eq('id', poId).single()
    expect(afterPartial!.status).toBe('partially_received')

    const full = await tenant.fetch('/api/procuretrack/goods-receipts', {
      method: 'POST',
      body: JSON.stringify({ po_id: poId, lines: [{ po_line_id: poLineId, quantity_received: 4 }] }),
    })
    expect((await full.json()).receipt.status).toBe('full')

    const { data: afterFull } = await supabaseAdmin.from('procuretrack_purchase_orders').select('status').eq('id', poId).single()
    expect(afterFull!.status).toBe('received')
  })

  let matchedInvoiceId: string

  it('captures an invoice matching the PO/GRN exactly -> status matched', async () => {
    const res = await accounts.fetch('/api/procuretrack/invoices', {
      method: 'POST',
      body: JSON.stringify({
        po_id: poId, invoice_number: 'INV-ACME-001', invoice_date: '2026-11-01',
        lines: [{ po_line_id: poLineId, description: 'Office chairs', quantity: 10, unit_price: 48000 }],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    matchedInvoiceId = body.invoice.id
    expect(body.invoice.status).toBe('matched')
    expect(body.invoice.match_result.status).toBe('matched')
  })

  it('captures a second, mismatched invoice (over-invoiced quantity) and requires AP review before it can be approved', async () => {
    const res = await accounts.fetch('/api/procuretrack/invoices', {
      method: 'POST',
      body: JSON.stringify({
        po_id: poId, invoice_number: 'INV-ACME-002', invoice_date: '2026-11-02',
        lines: [{ po_line_id: poLineId, description: 'Office chairs (extra)', quantity: 20, unit_price: 48000 }],
      }),
    })
    const invoice = (await res.json()).invoice
    expect(invoice.status).toBe('mismatched')

    const rejectNoNote = await accounts.fetch('/api/procuretrack/invoices', {
      method: 'PATCH', body: JSON.stringify({ id: invoice.id, status: 'approved' }),
    })
    expect(rejectNoNote.status).toBe(400)

    const approveWithNote = await accounts.fetch('/api/procuretrack/invoices', {
      method: 'PATCH', body: JSON.stringify({ id: invoice.id, status: 'approved', review_note: 'Vendor confirmed a follow-up delivery' }),
    })
    expect(approveWithNote.status).toBe(200)
  })

  it('pays the matched invoice -- posts a balanced journal entry (debit operating_expenses, credit operating_cash) and flips the invoice to paid', async () => {
    const res = await accounts.fetch('/api/procuretrack/payments', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: matchedInvoiceId, payment_method: 'bank_transfer', reference: 'TXN-001' }),
    })
    expect(res.status).toBe(201)
    const payment = (await res.json()).payment
    expect(Number(payment.amount)).toBe(480000)
    expect(payment.journal_entry_id).toBeTruthy()

    const { data: entry } = await supabaseAdmin.from('journal_entries').select('*').eq('id', payment.journal_entry_id).single()
    expect(entry!.source_type).toBe('procuretrack_payment')

    const { data: lines } = await supabaseAdmin.from('journal_lines').select('*').eq('journal_entry_id', payment.journal_entry_id)
    const totalDebit = lines!.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = lines!.reduce((s, l) => s + Number(l.credit), 0)
    expect(totalDebit).toBe(totalCredit)
    expect(totalDebit).toBe(480000)

    const accounts_ = await getChartOfAccounts(tenant)
    const expenseAccount = accounts_.find((a) => a.key === 'operating_expenses')
    expect(expenseAccount).toBeDefined()

    const { data: invoice } = await supabaseAdmin.from('procuretrack_invoices').select('status').eq('id', matchedInvoiceId).single()
    expect(invoice!.status).toBe('paid')
  })

  it('refuses to pay an already-fully-paid invoice again', async () => {
    const res = await accounts.fetch('/api/procuretrack/payments', {
      method: 'POST', body: JSON.stringify({ invoice_id: matchedInvoiceId }),
    })
    expect(res.status).toBe(400)
  })

  it('a non-AP role (plain staff/owner-only route) cannot post a payment', async () => {
    const staff = await createTestUser(tenant, { role: 'staff' })
    const res = await staff.fetch('/api/procuretrack/payments', {
      method: 'POST', body: JSON.stringify({ invoice_id: matchedInvoiceId }),
    })
    expect(res.status).toBe(403)
  })
})
