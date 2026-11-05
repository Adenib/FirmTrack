import { describe, it, expect } from 'vitest'
import { match3Way, type PoLine, type ReceivedLine, type InvoiceLine } from '@/lib/procuretrack/three-way-match'

const poLines: PoLine[] = [
  { poLineId: 'l1', description: 'Laptop', quantity: 5, unitPrice: 600000 },
]

describe('match3Way', () => {
  it('matches when received/invoiced quantity and price all agree with the PO', () => {
    const received: ReceivedLine[] = [{ poLineId: 'l1', quantityReceived: 5 }]
    const invoiced: InvoiceLine[] = [{ poLineId: 'l1', quantity: 5, unitPrice: 600000 }]
    const result = match3Way(poLines, received, invoiced)
    expect(result.status).toBe('matched')
    expect(result.lines[0].reasons).toEqual([])
  })

  it('flags a mismatch when the invoiced quantity exceeds what was actually received', () => {
    const received: ReceivedLine[] = [{ poLineId: 'l1', quantityReceived: 3 }]
    const invoiced: InvoiceLine[] = [{ poLineId: 'l1', quantity: 5, unitPrice: 600000 }]
    const result = match3Way(poLines, received, invoiced)
    expect(result.status).toBe('mismatched')
    expect(result.lines[0].reasons[0]).toMatch(/exceeds received quantity/)
  })

  it('tolerates a price within the configured tolerance', () => {
    const received: ReceivedLine[] = [{ poLineId: 'l1', quantityReceived: 5 }]
    const invoiced: InvoiceLine[] = [{ poLineId: 'l1', quantity: 5, unitPrice: 600000 * 1.01 }]
    const result = match3Way(poLines, received, invoiced, 2)
    expect(result.status).toBe('matched')
  })

  it('flags a price that exceeds the tolerance', () => {
    const received: ReceivedLine[] = [{ poLineId: 'l1', quantityReceived: 5 }]
    const invoiced: InvoiceLine[] = [{ poLineId: 'l1', quantity: 5, unitPrice: 600000 * 1.05 }]
    const result = match3Way(poLines, received, invoiced, 2)
    expect(result.status).toBe('mismatched')
    expect(result.lines[0].reasons[0]).toMatch(/exceeds PO price/)
  })

  it('never auto-advances -- a mismatched line still reports its raw figures for human review', () => {
    const received: ReceivedLine[] = [{ poLineId: 'l1', quantityReceived: 2 }]
    const invoiced: InvoiceLine[] = [{ poLineId: 'l1', quantity: 5, unitPrice: 600000 }]
    const result = match3Way(poLines, received, invoiced)
    expect(result.lines[0]).toMatchObject({ poQuantity: 5, receivedQuantity: 2, invoicedQuantity: 5 })
  })

  it('flags a line with no goods receipt at all when invoiced', () => {
    const invoiced: InvoiceLine[] = [{ poLineId: 'l1', quantity: 5, unitPrice: 600000 }]
    const result = match3Way(poLines, [], invoiced)
    expect(result.status).toBe('mismatched')
  })
})
