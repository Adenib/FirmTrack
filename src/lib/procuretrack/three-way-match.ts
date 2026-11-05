// Pure 3-way match logic -- no I/O, directly unit-testable. Compares a
// PO's lines against what was actually received (GRN) and what the
// vendor invoiced, flagging mismatches for a human to review. Mirrors
// reconciliation-matching.ts's "suggest, never auto-apply" shape: this
// never approves anything itself, it only classifies.

export type PoLine = { poLineId: string; description: string; quantity: number; unitPrice: number }
export type ReceivedLine = { poLineId: string; quantityReceived: number }
export type InvoiceLine = { poLineId: string | null; quantity: number; unitPrice: number }

export type LineMatchResult = {
  poLineId: string
  description: string
  status: 'matched' | 'mismatched'
  reasons: string[]
  poQuantity: number
  receivedQuantity: number
  invoicedQuantity: number
  poUnitPrice: number
  invoicedUnitPrice: number | null
}

export type ThreeWayMatchResult = {
  status: 'matched' | 'mismatched'
  lines: LineMatchResult[]
}

// tolerancePct: how far an invoice's unit price may vary from the PO's
// unit price and still count as matched (e.g. 2 = up to 2% over).
export function match3Way(
  poLines: PoLine[],
  receivedLines: ReceivedLine[],
  invoiceLines: InvoiceLine[],
  tolerancePct = 2
): ThreeWayMatchResult {
  const lines: LineMatchResult[] = poLines.map((po) => {
    const received = receivedLines
      .filter((r) => r.poLineId === po.poLineId)
      .reduce((sum, r) => sum + r.quantityReceived, 0)
    const invoiced = invoiceLines.filter((i) => i.poLineId === po.poLineId)
    const invoicedQuantity = invoiced.reduce((sum, i) => sum + i.quantity, 0)
    const invoicedUnitPrice = invoiced.length > 0 ? invoiced[0].unitPrice : null

    const reasons: string[] = []
    if (invoicedQuantity > received) {
      reasons.push(`Invoiced quantity (${invoicedQuantity}) exceeds received quantity (${received})`)
    }
    if (invoicedUnitPrice != null) {
      const maxAllowed = po.unitPrice * (1 + tolerancePct / 100)
      if (invoicedUnitPrice > maxAllowed) {
        reasons.push(`Invoiced unit price (${invoicedUnitPrice}) exceeds PO price (${po.unitPrice}) by more than ${tolerancePct}%`)
      }
    } else if (invoicedQuantity > 0) {
      reasons.push('Invoiced quantity present with no matching unit price')
    }

    return {
      poLineId: po.poLineId,
      description: po.description,
      status: reasons.length === 0 ? 'matched' : 'mismatched',
      reasons,
      poQuantity: po.quantity,
      receivedQuantity: received,
      invoicedQuantity,
      poUnitPrice: po.unitPrice,
      invoicedUnitPrice,
    }
  })

  return {
    status: lines.every((l) => l.status === 'matched') ? 'matched' : 'mismatched',
    lines,
  }
}
