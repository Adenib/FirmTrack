import { createClient } from '@supabase/supabase-js'
import { getValidGraphToken } from '@/lib/microsoft-graph/tokens'
import { listSharePointListItems, findDirectoryUserByDisplayName } from '@/lib/microsoft-graph/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Keys here are FirmTrack's own asset fields; values in field_mapping are
// the SharePoint column's *internal* name (not its displayName) -- Graph's
// item.fields payload is keyed by internal name, so that's what actually
// indexes into it. The settings UI shows displayName to the admin but
// stores the internal name underneath, same as any label/value select.
const MAPPABLE_FIELDS = [
  'asset_tag', 'serial_number', 'make', 'model', 'assignee',
  'purchase_date', 'warranty_end_date', 'replacement_cost',
  'status', 'condition',
] as const

// Some lists tuck extra commentary onto a name, e.g. "Ngozi Efobi (left
// with the laptop)" -- stripped before matching/searching so it doesn't
// defeat an otherwise-exact name lookup.
export function stripParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

export type SyncSummary = {
  created: number
  updated: number
  skipped: number
  deleted: number
  unresolvedAssignees: string[]
  errors: string[]
}

export function fieldToString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  // A Person/Group column, when expanded, commonly comes back as an object
  // carrying the resolved identity rather than a plain string.
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const candidate = obj.Email || obj.email || obj.LookupValue || obj.DisplayName
    return typeof candidate === 'string' ? candidate.trim() || null : null
  }
  return null
}

export function fieldToNumber(value: unknown): number | null {
  const str = fieldToString(value)
  if (str == null) return null
  const cleaned = str.replace(/[^0-9.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function fieldToDate(value: unknown): string | null {
  const str = fieldToString(value)
  if (!str) return null
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export async function runAssetSync(tenantId: string, userId: string): Promise<SyncSummary> {
  const { data: settings } = await supabaseAdmin
    .from('assettrack_sync_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!settings?.sharepoint_site_id || !settings?.sharepoint_list_id) {
    throw new Error('Connect a SharePoint site and list before syncing (see AssetTrack Settings).')
  }

  const mapping = (settings.field_mapping || {}) as Record<string, string>
  if (!mapping.asset_tag) {
    throw new Error('Map an asset_tag column before syncing -- it is required and has no default.')
  }

  const accessToken = await getValidGraphToken(userId)
  if (!accessToken) {
    throw new Error('Connect (or reconnect) your Microsoft account from My Account before syncing.')
  }

  const items = await listSharePointListItems(accessToken, settings.sharepoint_site_id, settings.sharepoint_list_id)

  const { data: tenantUsers } = await supabaseAdmin.from('users').select('id, email').eq('tenant_id', tenantId)
  const usersByEmail = new Map((tenantUsers || []).map((u) => [u.email.toLowerCase(), u.id]))

  // Caches a display-name -> resolved-email lookup for the life of this
  // run (the same person is often the assignee on several rows), and
  // stops retrying Graph once it's clear the lookup can't succeed (e.g.
  // User.ReadBasic.All not yet admin-consented) -- one error in the
  // summary instead of one per row.
  const directoryLookupCache = new Map<string, string | null>()
  let directoryLookupDisabled = false

  async function resolveAssigneeEmail(raw: string): Promise<string | null> {
    if (raw.includes('@')) return raw

    const cleaned = stripParenthetical(raw)
    if (!cleaned) return null
    if (directoryLookupCache.has(cleaned)) return directoryLookupCache.get(cleaned)!
    if (directoryLookupDisabled) return null

    try {
      const match = await findDirectoryUserByDisplayName(accessToken!, cleaned)
      const email = match?.email || null
      directoryLookupCache.set(cleaned, email)
      return email
    } catch (err) {
      directoryLookupDisabled = true
      summary.errors.push(
        `Directory name lookup unavailable (${err instanceof Error ? err.message : 'unknown error'}) -- assignees will be left unresolved by name. Grant User.ReadBasic.All admin consent in Entra ID and reconnect Microsoft to enable it.`
      )
      return null
    }
  }

  const summary: SyncSummary = { created: 0, updated: 0, skipped: 0, deleted: 0, unresolvedAssignees: [], errors: [] }
  let mappedAnyAssetTag = false

  for (const item of items) {
    const assetTag = fieldToString(item.fields[mapping.asset_tag])
    if (!assetTag) {
      summary.skipped += 1
      summary.errors.push(`Item ${item.id}: no asset tag value -- check the asset_tag column mapping`)
      continue
    }
    mappedAnyAssetTag = true

    // assignee_name holds the source value verbatim regardless of match
    // status -- a list often records a plain name even when it DOES
    // resolve to a FirmTrack user, and that original label is worth
    // keeping visible (e.g. the Asset Register shows both side by side),
    // not just discarded once assigned_to is set.
    const assigneeRaw = mapping.assignee ? fieldToString(item.fields[mapping.assignee]) : null
    let assignedTo: string | null = null
    if (assigneeRaw) {
      const resolvedEmail = await resolveAssigneeEmail(assigneeRaw)
      const matchedId = resolvedEmail ? usersByEmail.get(resolvedEmail.toLowerCase()) : undefined
      if (matchedId) {
        assignedTo = matchedId
      } else {
        summary.unresolvedAssignees.push(assigneeRaw)
      }
    }

    const row = {
      tenant_id: tenantId,
      asset_tag: assetTag,
      serial_number: mapping.serial_number ? fieldToString(item.fields[mapping.serial_number]) : null,
      make: mapping.make ? fieldToString(item.fields[mapping.make]) : null,
      model: mapping.model ? fieldToString(item.fields[mapping.model]) : null,
      assigned_to: assignedTo,
      assignee_name: assigneeRaw,
      purchase_date: mapping.purchase_date ? fieldToDate(item.fields[mapping.purchase_date]) : null,
      warranty_end_date: mapping.warranty_end_date ? fieldToDate(item.fields[mapping.warranty_end_date]) : null,
      replacement_cost: mapping.replacement_cost ? fieldToNumber(item.fields[mapping.replacement_cost]) : null,
      status_note: mapping.status ? fieldToString(item.fields[mapping.status]) : null,
      condition_note: mapping.condition ? fieldToString(item.fields[mapping.condition]) : null,
      external_source: 'sharepoint' as const,
      external_item_id: item.id,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }

    // Match by asset_tag first -- it's the human-meaningful key (and the
    // one with a uniqueness constraint), so a reissued/duplicated list
    // entry that shares a tag with an already-synced or manually-created
    // asset updates that same row instead of colliding on insert. Falls
    // back to external_item_id so a renamed tag on an already-tracked
    // item still updates in place rather than creating a duplicate.
    const { data: existingByTag } = await supabaseAdmin
      .from('assettrack_assets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('asset_tag', assetTag)
      .maybeSingle()

    const existing =
      existingByTag ||
      (
        await supabaseAdmin
          .from('assettrack_assets')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('external_source', 'sharepoint')
          .eq('external_item_id', item.id)
          .maybeSingle()
      ).data

    if (existing) {
      const { error } = await supabaseAdmin.from('assettrack_assets').update(row).eq('id', existing.id)
      if (error) summary.errors.push(`Item ${item.id}: ${error.message}`)
      else summary.updated += 1
    } else {
      const { error } = await supabaseAdmin.from('assettrack_assets').insert(row)
      if (error) summary.errors.push(`Item ${item.id}: ${error.message}`)
      else summary.created += 1
    }
  }

  if (items.length > 0 && !mappedAnyAssetTag) {
    throw new Error('None of the list items had a value in the mapped asset_tag column -- the mapping is likely wrong (a renamed or deleted SharePoint column).')
  }

  // Remove assets whose source row no longer exists in the list (deleted
  // or filtered out in SharePoint since the last sync). Safe to hard
  // delete: assettrack_tickets.asset_id is ON DELETE SET NULL, so a
  // ticket just loses its asset link, never its own history. Only ever
  // touches previously-synced rows (external_source = 'sharepoint'),
  // never a manually-created asset. Guarded on items.length > 0 so a
  // transient empty response from Graph can't wipe the whole register.
  if (items.length > 0) {
    const seenItemIds = new Set(items.map((i) => i.id))
    const { data: previouslySynced } = await supabaseAdmin
      .from('assettrack_assets')
      .select('id, external_item_id')
      .eq('tenant_id', tenantId)
      .eq('external_source', 'sharepoint')

    const staleIds = (previouslySynced || [])
      .filter((a) => a.external_item_id && !seenItemIds.has(a.external_item_id))
      .map((a) => a.id)

    if (staleIds.length > 0) {
      const { error, count } = await supabaseAdmin
        .from('assettrack_assets')
        .delete({ count: 'exact' })
        .in('id', staleIds)
      if (error) summary.errors.push(`Could not remove ${staleIds.length} asset(s) deleted from the source list: ${error.message}`)
      else summary.deleted = count || staleIds.length
    }
  }

  await supabaseAdmin
    .from('assettrack_sync_settings')
    .update({
      last_synced_at: new Date().toISOString(),
      last_synced_by: userId,
      last_sync_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)

  return summary
}

export { MAPPABLE_FIELDS }
