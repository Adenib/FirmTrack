import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { type, records } = await request.json()

  if (!type || !records || !Array.isArray(records)) {
    return NextResponse.json({ error: 'type and records array are required' }, { status: 400 })
  }

  if (type === 'clients') {
    const rows = records.map((r: Record<string, string>) => ({
      tenant_id: profile.tenant_id,
      name: r.name || r.Name || r.NAME || '',
      email: r.email || r.Email || r.EMAIL || null,
      phone: r.phone || r.Phone || r.PHONE || null,
      company: r.company || r.Company || r.COMPANY || null,
      notes: r.notes || r.Notes || r.NOTES || null,
    })).filter((r) => r.name.trim() !== '')

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found. Make sure CSV has a "name" column.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert(rows)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ imported: data?.length || 0, type: 'clients' })
  }

  if (type === 'employees') {
    const rows = records.map((r: Record<string, string>) => ({
      tenant_id: profile.tenant_id,
      full_name: r.full_name || r.name || r.Name || r.NAME || '',
      email: r.email || r.Email || null,
      phone: r.phone || r.Phone || null,
      department: r.department || r.Department || null,
      job_title: r.job_title || r.title || r.Title || null,
      employment_type: r.employment_type || 'full_time',
      start_date: r.start_date || r.startDate || new Date().toISOString().split('T')[0],
      gross_salary: r.gross_salary || r.salary || null,
    })).filter((r) => r.full_name.trim() !== '')

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found. Make sure CSV has a "full_name" or "name" column.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('employees')
      .insert(rows)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ imported: data?.length || 0, type: 'employees' })
  }

  return NextResponse.json({ error: 'Unknown import type' }, { status: 400 })
}