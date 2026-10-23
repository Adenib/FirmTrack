import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Adds one manual statement line to an existing import -- for the odd
// transaction missing from a bank's CSV export, added by hand rather than
// re-uploading the whole file.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: importRow } = await supabaseAdmin
    .from('bank_statement_imports')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!importRow) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  const { line_date, description, amount, reference } = await request.json()
  if (!line_date || typeof amount !== 'number' || Number.isNaN(amount)) {
    return NextResponse.json({ error: 'line_date and a numeric amount are required' }, { status: 400 })
  }

  const { data: line, error } = await supabaseAdmin
    .from('bank_statement_lines')
    .insert({
      tenant_id: profile.tenant_id,
      import_id: id,
      line_date,
      description: description || null,
      amount,
      reference: reference || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ line })
}
