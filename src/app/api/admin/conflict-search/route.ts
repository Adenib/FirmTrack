import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Searches every name given against clients, matters, and time entries —
// all tenant-scoped — so a conflict check catches a name that only ever
// appears in a past time entry's narrative (e.g. "call with opposing
// counsel for Acme Corp"), not just structured client/matter names. Runs
// as a plain search (no confirmation/persistence here) — the New Matter
// page calls this repeatedly as staff refine names, and only the final
// confirmed result gets recorded, by POST /api/admin/matters.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { names } = await request.json()
  const terms = (Array.isArray(names) ? names : [])
    .map((n: string) => (n || '').trim())
    .filter((n: string) => n.length > 0)

  if (terms.length === 0) {
    return NextResponse.json({ error: 'At least one name is required' }, { status: 400 })
  }

  const clientOrFilter = terms.map((t) => `name.ilike.%${t}%,company.ilike.%${t}%`).join(',')
  const matterOrFilter = terms.map((t) => `case_name.ilike.%${t}%,description.ilike.%${t}%`).join(',')
  const timeEntryOrFilter = terms.map((t) => `explanation.ilike.%${t}%,notes.ilike.%${t}%`).join(',')

  const [clientsRes, mattersRes, timeEntriesRes] = await Promise.all([
    supabaseAdmin
      .from('clients')
      .select('id, name, company, email')
      .eq('tenant_id', profile.tenant_id)
      .or(clientOrFilter)
      .limit(25),
    supabaseAdmin
      .from('matters')
      .select('id, matter_id, case_name, status, clients(name)')
      .eq('tenant_id', profile.tenant_id)
      .or(matterOrFilter)
      .limit(25),
    supabaseAdmin
      .from('time_entries')
      .select('id, entry_date, explanation, notes, matters(matter_id, case_name)')
      .eq('tenant_id', profile.tenant_id)
      .or(timeEntryOrFilter)
      .order('entry_date', { ascending: false })
      .limit(25),
  ])

  const results = {
    searchedAt: new Date().toISOString(),
    terms,
    clients: clientsRes.data || [],
    matters: mattersRes.data || [],
    timeEntries: timeEntriesRes.data || [],
  }

  return NextResponse.json({ results })
}
