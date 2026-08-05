import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generatePayslipPdf, type PayrollLineItemRow } from '@/lib/hrtrack/payslip-pdf'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAYROLL_PRIVILEGED = ['owner', 'admin', 'hr']

// Returns the payslip as a PDF -- the employee it belongs to, or
// owner/admin for anyone's. Only posted runs have a real payslip; a
// draft's numbers aren't final yet.
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const lineItemId = searchParams.get('line_item_id')
  if (!lineItemId) return NextResponse.json({ error: 'line_item_id is required' }, { status: 400 })

  const { data: lineItem } = await supabaseAdmin
    .from('payroll_line_items')
    .select('*, payroll_runs(status)')
    .eq('id', lineItemId)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!lineItem) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })

  if (lineItem.user_id !== user.id && !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized to view this payslip' }, { status: 403 })
  }

  const run = Array.isArray(lineItem.payroll_runs) ? lineItem.payroll_runs[0] : lineItem.payroll_runs
  if (run?.status !== 'posted') {
    return NextResponse.json({ error: 'This payroll run has not been posted yet' }, { status: 400 })
  }

  const pdf = await generatePayslipPdf(profile.tenant_id, lineItem as PayrollLineItemRow)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip.pdf"`,
    },
  })
}
