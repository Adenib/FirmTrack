import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function generateMatterId(tenantId: string, clientId: string): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2)

  // Get client sequence number
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('client_sequence, client_year')
    .eq('id', clientId)
    .single()

  const clientSeq = String(client?.client_sequence || 1).padStart(3, '0')

  // Get next matter sequence for this client
  const { data: matters } = await supabaseAdmin
    .from('matters')
    .select('matter_id')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)

  const nextMatterSeq = String((matters?.length || 0) + 1).padStart(3, '0')

  return `${year}-${clientSeq}-${nextMatterSeq}`
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json()
  const client_id = body.client_id
  const matter_id = body.matter_id
  const case_name = body.case_name
  const description = body.description
  const law_type = body.law_type
  const introducing_lawyer = body.introducing_lawyer
  const billing_name = body.billing_name
  const billing_address = body.billing_address
  const business_phone = body.business_phone
  const billing_currency = body.billing_currency ?? null
  const associate_rate = body.associate_rate ?? 250
  const senior_associate_rate = body.senior_associate_rate ?? 350
  const partner_rate = body.partner_rate ?? 550
  const responsible_lawyer = body.responsible_lawyer
  const assigned_lawyer = body.assigned_lawyer
  const other_staff = body.other_staff
  const open_date = body.open_date
  const status = body.status
  const lawyers = body.lawyers
  const rate_type = body.rate_type || 'A'
  const b_associate_rate = body.b_associate_rate || null
  const b_senior_associate_rate = body.b_senior_associate_rate || null
  const b_partner_rate = body.b_partner_rate || null
  const c_associate_rate = body.c_associate_rate || null
  const c_senior_associate_rate = body.c_senior_associate_rate || null
  const c_partner_rate = body.c_partner_rate || null
  const d_associate_rate = body.d_associate_rate || null
  const d_senior_associate_rate = body.d_senior_associate_rate || null
  const d_partner_rate = body.d_partner_rate || null
  const e_associate_rate = body.e_associate_rate || null
  const e_senior_associate_rate = body.e_senior_associate_rate || null
  const e_partner_rate = body.e_partner_rate || null
  if (!client_id || !case_name) {
    return NextResponse.json({ error: 'client_id and case_name are required' }, { status: 400 })
  }

  const finalMatterId = matter_id || await generateMatterId(profile.tenant_id, client_id)

  const { data: matter, error: matterError } = await supabaseAdmin
    .from('matters')
    .insert({
      tenant_id: profile.tenant_id,
      client_id,
      matter_id: finalMatterId,
      case_name,
      description: description || null,
      law_type: law_type || null,
      introducing_lawyer: introducing_lawyer || null,
      billing_name: billing_name || null,
      billing_address: billing_address || null,
      business_phone: business_phone || null,
      billing_currency: billing_currency || null,
      associate_rate: associate_rate || 250,
      senior_associate_rate: senior_associate_rate || 350,
      partner_rate: partner_rate || 550,
      rate_type: rate_type,
      b_associate_rate: b_associate_rate,
      b_senior_associate_rate: b_senior_associate_rate,
      b_partner_rate: b_partner_rate,
      c_associate_rate: c_associate_rate,
      c_senior_associate_rate: c_senior_associate_rate,
      c_partner_rate: c_partner_rate,
      d_associate_rate: d_associate_rate,
      d_senior_associate_rate: d_senior_associate_rate,
      d_partner_rate: d_partner_rate,
      e_associate_rate: e_associate_rate,
      e_senior_associate_rate: e_senior_associate_rate,
      e_partner_rate: e_partner_rate,
      responsible_lawyer: responsible_lawyer || null,
      assigned_lawyer: assigned_lawyer || null,
      other_staff: other_staff || [],
      open_date: open_date || new Date().toISOString().split('T')[0],
      status: status || 'active',
    })
    .select()
    .single()

  if (matterError || !matter) {
    return NextResponse.json({ error: matterError?.message || 'Failed to create matter' }, { status: 500 })
  }

  // Insert lawyer assignments
  if (lawyers && Array.isArray(lawyers) && lawyers.length > 0) {
    const lawyerRows = lawyers
      .filter((l: { user_id: string; rate_tier: string }) => l.user_id && l.rate_tier)
      .map((l: { user_id: string; rate_tier: string }) => ({
        tenant_id: profile.tenant_id,
        matter_id: matter.id,
        user_id: l.user_id,
        rate_tier: l.rate_tier,
      }))

    if (lawyerRows.length > 0) {
      await supabaseAdmin.from('matter_lawyers').insert(lawyerRows)
    }
  }

  return NextResponse.json({ matter })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('matters')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ matter: data })
}