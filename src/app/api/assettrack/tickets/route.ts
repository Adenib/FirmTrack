import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { hasActiveModule } from '@/lib/require-module'
import { ASSETTRACK_STAFF_ROLES } from '@/lib/assettrack/roles'
import { assessRepairCost } from '@/lib/assettrack/policy'
import { notifyAssetTicketSubmitted, notifyAssetTicketReporter } from '@/lib/assettrack/notify-ticket'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORIES = ['software', 'hardware', 'charger_power', 'performance', 'physical_damage', 'other']
const IMPACTS = ['low', 'normal', 'high', 'critical']
const STATUSES = [
  'submitted', 'triage', 'remote_support', 'awaiting_device', 'diagnosis',
  'awaiting_approval', 'awaiting_parts', 'vendor_repair', 'testing',
  'ready_for_collection', 'returned', 'closed', 'replacement_recommended', 'cancelled',
]
const DECISIONS = ['repair', 'replace', 'warranty', 'pending']

// Fields only owner/admin/manager ("IT staff") may set -- everything else
// on PATCH (user_confirmed, a self-cancel) is handled as its own branch
// below with its own, narrower authorization rule.
const STAFF_EDITABLE_FIELDS = [
  'asset_id', 'status', 'triage_notes', 'diagnosis', 'data_backed_up', 'backup_notes',
  'estimated_repair_cost', 'estimated_replacement_cost', 'decision', 'vendor_name',
  'parts_status', 'resolution_notes',
] as const

// Cost estimates and vendor name are staff-only, even on the reporting
// employee's own ticket -- stripped from every row for a non-staff caller.
const STAFF_ONLY_RESPONSE_FIELDS = ['estimated_repair_cost', 'estimated_replacement_cost', 'vendor_name', 'decision_by']

const EVENT_TYPE_BY_STATUS: Record<string, string> = {
  triage: 'triaged',
  diagnosis: 'diagnosed',
  vendor_repair: 'sent_to_vendor',
  testing: 'tested',
  returned: 'returned_to_employee',
  closed: 'closed',
  cancelled: 'cancelled',
}

async function getProfile(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id, role').eq('id', userId).single()
  return data
}

function stripStaffOnlyFields<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => {
    const copy = { ...row }
    for (const field of STAFF_ONLY_RESPONSE_FIELDS) delete copy[field]
    return copy
  })
}

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }

  const isStaff = ASSETTRACK_STAFF_ROLES.includes(profile.role)
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const { data: ticket } = await supabaseAdmin
      .from('assettrack_tickets')
      .select('*, asset:asset_id(id, asset_tag, make, model), reporter:reported_by(email)')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    if (!isStaff && ticket.reported_by !== user.id) {
      return NextResponse.json({ error: 'Not authorized to view this ticket' }, { status: 403 })
    }

    const { data: events } = await supabaseAdmin
      .from('assettrack_ticket_events')
      .select('*, actor:user_id(email)')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    const [visibleTicket] = isStaff ? [ticket] : stripStaffOnlyFields([ticket])
    return NextResponse.json({ ticket: visibleTicket, events: events || [], isStaff })
  }

  const status = searchParams.get('status')
  const assetId = searchParams.get('asset_id')
  const mine = searchParams.get('mine') === 'true'

  let query = supabaseAdmin
    .from('assettrack_tickets')
    .select('*, asset:asset_id(id, asset_tag, make, model), reporter:reported_by(email)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (assetId) query = query.eq('asset_id', assetId)
  if (mine || !isStaff) query = query.eq('reported_by', user.id)

  const { data: tickets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: isStaff ? tickets : stripStaffOnlyFields(tickets || []), isStaff })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }

  const body = await request.json()
  const { asset_id, category, impact, issue_description, notify_email } = body

  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(', ')}` }, { status: 400 })
  }
  if (impact != null && !IMPACTS.includes(impact)) {
    return NextResponse.json({ error: `impact must be one of: ${IMPACTS.join(', ')}` }, { status: 400 })
  }
  if (typeof issue_description !== 'string' || !issue_description.trim()) {
    return NextResponse.json({ error: 'issue_description is required' }, { status: 400 })
  }
  if (notify_email != null && !/^\S+@\S+\.\S+$/.test(notify_email)) {
    return NextResponse.json({ error: 'notify_email is not a valid email address' }, { status: 400 })
  }

  let asset: {
    id: string
    asset_tag: string
    make: string | null
    model: string | null
    assignee_name: string | null
    assignee: { email: string }[] | null
  } | null = null
  if (asset_id) {
    const { data } = await supabaseAdmin
      .from('assettrack_assets')
      .select('id, asset_tag, make, model, assignee_name, assignee:assigned_to(email)')
      .eq('id', asset_id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    if (!data) return NextResponse.json({ error: 'Unknown asset_id' }, { status: 400 })
    asset = data
  }

  const { data: ticket, error } = await supabaseAdmin
    .from('assettrack_tickets')
    .insert({
      tenant_id: profile.tenant_id,
      asset_id: asset_id || null,
      reported_by: user.id,
      category,
      impact: impact || 'normal',
      issue_description: issue_description.trim(),
      notify_email: notify_email || null,
      status: 'submitted',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('assettrack_ticket_events').insert({
    tenant_id: profile.tenant_id,
    ticket_id: ticket.id,
    user_id: user.id,
    event_type: 'created',
    metadata: { to_status: 'submitted' },
  })

  // Best-effort IT notification -- a missing/unconfigured recipient or a
  // transport failure must never fail ticket creation itself.
  const { data: settings } = await supabaseAdmin
    .from('assettrack_sync_settings')
    .select('notification_email')
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()

  if (settings?.notification_email) {
    const reference = `AT-${ticket.id.slice(0, 8).toUpperCase()}`
    const assetLine = asset ? `${asset.asset_tag} — ${asset.make || ''} ${asset.model || ''}`.trim() : 'No device linked'
    // The reporter (whoever submitted the ticket) isn't always the same
    // person the laptop is actually registered to in the asset register
    // -- e.g. IT or an office admin reporting on someone else's behalf --
    // so both are worth showing distinctly.
    const laptopUserLine = asset
      ? [asset.assignee_name, asset.assignee?.[0]?.email].filter(Boolean).join(' — ') || 'Unassigned'
      : null
    await notifyAssetTicketSubmitted({
      to: settings.notification_email,
      subject: `New AssetTrack ticket ${reference}: ${category}`,
      html: `
        <p>A new laptop repair ticket was submitted on FirmTrack.</p>
        <p><strong>Reference:</strong> ${reference}<br/>
        <strong>Reported by:</strong> ${user.email}<br/>
        <strong>Device:</strong> ${assetLine}<br/>
        ${laptopUserLine ? `<strong>Laptop registered to:</strong> ${laptopUserLine}<br/>` : ''}
        <strong>Category:</strong> ${category}<br/>
        <strong>Impact:</strong> ${impact || 'normal'}</p>
        <p><strong>Description:</strong><br/>${issue_description.trim()}</p>
      `,
    })
  }

  return NextResponse.json({ ticket }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  if (!(await hasActiveModule(profile.tenant_id, 'assettrack'))) {
    return NextResponse.json({ error: 'AssetTrack is not active for this tenant' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('assettrack_tickets')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const isStaff = ASSETTRACK_STAFF_ROLES.includes(profile.role)
  const isReporter = existing.reported_by === user.id

  // Branch 1: the reporting employee confirms they received the device --
  // the only field a non-staff caller may ever set, and only from the
  // 'returned' state. This both confirms and closes the ticket in one step.
  if ('user_confirmed' in body) {
    if (!isReporter) return NextResponse.json({ error: 'Only the reporting employee can confirm receipt' }, { status: 403 })
    if (existing.status !== 'returned') {
      return NextResponse.json({ error: "Ticket must be in 'returned' status before it can be confirmed" }, { status: 400 })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('assettrack_tickets')
      .update({
        user_confirmed: true,
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('assettrack_ticket_events').insert({
      tenant_id: profile.tenant_id,
      ticket_id: id,
      user_id: user.id,
      event_type: 'confirmed_by_employee',
      metadata: { from_status: 'returned', to_status: 'closed' },
    })

    return NextResponse.json({ ticket: isStaff ? updated : stripStaffOnlyFields([updated])[0] })
  }

  // Branch 2: a self-cancel by the original reporter -- the one staff
  // field a non-staff caller may also touch, and only this one value.
  const isSelfCancel = !isStaff && isReporter && body.status === 'cancelled' && Object.keys(body).length === 2

  if (!isStaff && !isSelfCancel) {
    return NextResponse.json({ error: 'Not authorized to update this ticket' }, { status: 403 })
  }

  const patch: Record<string, unknown> = {}
  for (const field of STAFF_EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No supported fields supplied' }, { status: 400 })
  }

  if ('status' in patch && !STATUSES.includes(String(patch.status))) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if ('decision' in patch && !DECISIONS.includes(String(patch.decision))) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  }
  for (const field of ['estimated_repair_cost', 'estimated_replacement_cost']) {
    if (field in patch && patch[field] !== null) {
      const n = Number(patch[field])
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
      patch[field] = n
    }
  }

  const newStatus = typeof patch.status === 'string' ? patch.status : existing.status
  const statusChanged = newStatus !== existing.status

  if (newStatus === 'returned') {
    const resolutionNotes = ('resolution_notes' in patch ? patch.resolution_notes : existing.resolution_notes) as string | null
    if (!resolutionNotes || !String(resolutionNotes).trim()) {
      return NextResponse.json({ error: 'resolution_notes is required before marking a ticket returned' }, { status: 400 })
    }
  }

  if (newStatus === 'closed' && !existing.user_confirmed && !body.override_reason) {
    return NextResponse.json(
      { error: 'Closing before employee confirmation requires an override_reason' },
      { status: 400 }
    )
  }

  patch.updated_at = new Date().toISOString()
  if ('decision' in patch) {
    patch.decision_by = user.id
    patch.decision_at = new Date().toISOString()
  }
  if (['returned', 'closed', 'cancelled'].includes(newStatus) && existing.asset_id) {
    await supabaseAdmin.from('assettrack_assets').update({ asset_status: 'active', updated_at: new Date().toISOString() }).eq('id', existing.asset_id)
  } else if (newStatus === 'triage' && existing.asset_id) {
    await supabaseAdmin.from('assettrack_assets').update({ asset_status: 'in_repair', updated_at: new Date().toISOString() }).eq('id', existing.asset_id)
  }

  const { data: updated, error } = await supabaseAdmin
    .from('assettrack_tickets')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const eventType = isSelfCancel
    ? 'cancelled'
    : 'decision' in patch
      ? 'decision_recorded'
      : statusChanged
        ? EVENT_TYPE_BY_STATUS[newStatus] || 'status_changed'
        : 'parts_status' in patch
          ? 'parts_updated'
          : 'status_changed'

  await supabaseAdmin.from('assettrack_ticket_events').insert({
    tenant_id: profile.tenant_id,
    ticket_id: id,
    user_id: user.id,
    event_type: eventType,
    metadata: {
      from_status: existing.status,
      to_status: newStatus,
      changed_fields: Object.keys(patch).filter((f) => f !== 'updated_at'),
      ...(body.override_reason ? { override_reason: body.override_reason } : {}),
    },
  })

  const assessment = 'decision' in patch || 'estimated_repair_cost' in patch || 'estimated_replacement_cost' in patch
    ? assessRepairCost(updated.estimated_repair_cost, updated.estimated_replacement_cost)
    : null

  // Best-effort update to the reporter -- the two moments that actually
  // need their attention (collect the device, or it's fully settled),
  // not every internal triage/parts tweak. Never blocks the response.
  if (statusChanged && ['returned', 'closed'].includes(newStatus)) {
    let recipient = updated.notify_email as string | null
    if (!recipient) {
      const { data: reporter } = await supabaseAdmin.from('users').select('email').eq('id', updated.reported_by).single()
      recipient = reporter?.email || null
    }
    if (recipient) {
      const reference = `AT-${updated.id.slice(0, 8).toUpperCase()}`
      const subject = newStatus === 'returned'
        ? `Your laptop is ready -- ${reference}`
        : `Ticket ${reference} closed`
      const html = newStatus === 'returned'
        ? `<p>Your laptop repair ticket <strong>${reference}</strong> is ready for collection.</p>
           <p><strong>Notes:</strong><br/>${updated.resolution_notes || ''}</p>
           <p>Please confirm receipt on FirmTrack once you have it back.</p>`
        : `<p>Your laptop repair ticket <strong>${reference}</strong> has been closed.</p>
           <p><strong>Notes:</strong><br/>${updated.resolution_notes || ''}</p>`
      await notifyAssetTicketReporter({ to: recipient, subject, html })
    }
  }

  return NextResponse.json({ ticket: isStaff ? updated : stripStaffOnlyFields([updated])[0], assessment })
}
