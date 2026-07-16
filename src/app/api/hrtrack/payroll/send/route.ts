import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendPayslipEmail, EmailSendError } from '@/lib/hrtrack/send-payslip-email'

const PAYROLL_PRIVILEGED = ['owner', 'admin']

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !PAYROLL_PRIVILEGED.includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { line_item_id } = await request.json()
  if (!line_item_id) return NextResponse.json({ error: 'line_item_id is required' }, { status: 400 })

  try {
    await sendPayslipEmail(profile.tenant_id, line_item_id)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof EmailSendError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
