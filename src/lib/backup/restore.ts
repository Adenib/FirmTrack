import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import AdmZip from 'adm-zip'
import { RESTORE_ORDER } from './tenant-tables'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

export class RestoreError extends Error {}

export type RestoreResult = {
  newOrgId: string
  newOrgSlug: string
  counts: Record<string, number>
  skippedUsers: { email: string; full_name: string }[]
}

// Creates a brand-new auth user + returns their id, or null if the email
// is already registered elsewhere -- callers decide the fallback.
async function tryCreateAuthUser(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  })
  if (error || !data.user) return null
  return data.user.id
}

function basename(path: string): string {
  return path.split('/').pop() || path
}

// Restores a backup (produced by exportTenantData / GET /api/admin/backup)
// into a brand-new organization -- never overwrites an existing tenant.
// See src/lib/backup/tenant-tables.ts for why users can't just be cloned:
// a person can only belong to one org and emails are unique platform-wide,
// so any backed-up user whose email is already registered gets skipped
// (their rows are reassigned to the new owner instead) and reported back.
export async function restoreTenantData(
  zipBuffer: Buffer,
  params: { newOrgName: string; newOwnerEmail: string }
): Promise<RestoreResult> {
  const zip = new AdmZip(zipBuffer)
  const dataEntry = zip.getEntry('data.json')
  if (!dataEntry) throw new RestoreError('Not a valid FirmTrack backup -- data.json is missing')

  const backup = JSON.parse(dataEntry.getData().toString('utf-8')) as {
    organization: Record<string, unknown>
    users: Record<string, unknown>[]
  } & Record<string, Record<string, unknown>[]>

  const orgName = params.newOrgName?.trim() || `${backup.organization.name} (Restored)`
  const slug = slugify(orgName) + '-' + Math.random().toString(36).slice(2, 7)

  const { data: newOrg, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({
      name: orgName,
      slug,
      plan: backup.organization.plan ?? 'free',
      mfa_required: backup.organization.mfa_required ?? false,
      annual_billing: backup.organization.annual_billing ?? false,
    })
    .select()
    .single()
  if (orgError || !newOrg) throw new RestoreError(`Could not create new organization: ${orgError?.message}`)

  const newOwnerId = await tryCreateAuthUser(params.newOwnerEmail)
  if (!newOwnerId) {
    await supabaseAdmin.from('organizations').delete().eq('id', newOrg.id)
    throw new RestoreError(`Could not create the new owner account -- "${params.newOwnerEmail}" may already be registered`)
  }
  await supabaseAdmin.from('users').insert({
    id: newOwnerId,
    tenant_id: newOrg.id,
    email: params.newOwnerEmail,
    full_name: params.newOwnerEmail,
    role: 'owner',
    is_active: true,
  })

  // Recreate every other user found in the backup, using their original
  // email. A collision (already registered) means that account can't be
  // cloned -- their rows fall back to the new owner instead of failing
  // the whole restore, and they're surfaced in skippedUsers for a manual
  // re-invite afterward.
  const userIdMap = new Map<string, string>()
  const skippedUsers: RestoreResult['skippedUsers'] = []
  for (const oldUser of backup.users || []) {
    const oldId = oldUser.id as string
    const email = oldUser.email as string
    if (email === params.newOwnerEmail) {
      userIdMap.set(oldId, newOwnerId)
      continue
    }
    const newUserId = await tryCreateAuthUser(email)
    if (!newUserId) {
      userIdMap.set(oldId, newOwnerId)
      skippedUsers.push({ email, full_name: (oldUser.full_name as string) || email })
      continue
    }
    await supabaseAdmin.from('users').insert({
      id: newUserId,
      tenant_id: newOrg.id,
      email,
      full_name: oldUser.full_name ?? null,
      role: oldUser.role ?? 'staff',
      is_active: oldUser.is_active ?? true,
    })
    userIdMap.set(oldId, newUserId)
  }

  const idMaps: Record<string, Map<string, string>> = {
    users: userIdMap,
    organizations: new Map([[backup.organization.id as string, newOrg.id]]),
  }
  const filesToCopy: { bucket: string; oldPath: string; newPath: string; contentType?: string }[] = []
  const counts: Record<string, number> = {}

  for (const table of RESTORE_ORDER) {
    const oldRows = backup[table.name] || []
    const newRows: Record<string, unknown>[] = []
    const map = new Map<string, string>()

    for (const oldRow of oldRows) {
      const newRow: Record<string, unknown> = { ...oldRow }
      const newId = table.idColumn ? crypto.randomUUID() : newOrg.id
      if (table.idColumn) newRow.id = newId
      if ('tenant_id' in newRow) newRow.tenant_id = newOrg.id

      for (const [col, target] of Object.entries(table.fkColumns || {})) {
        const oldVal = oldRow[col] as string | null
        newRow[col] = oldVal ? idMaps[target]?.get(oldVal) ?? null : null
      }
      for (const [col, target] of Object.entries(table.arrayFkColumns || {})) {
        const oldVal = oldRow[col] as string[] | null
        newRow[col] = Array.isArray(oldVal)
          ? oldVal.map((v) => idMaps[target]?.get(v)).filter((v): v is string => !!v)
          : oldVal
      }

      if (table.name === 'document_versions' && oldRow.storage_path) {
        const newDocumentId = idMaps.documents?.get(oldRow.document_id as string)
        const newPath = `${newOrg.id}/${newDocumentId}/${basename(oldRow.storage_path as string)}`
        newRow.storage_path = newPath
        filesToCopy.push({ bucket: 'documents', oldPath: oldRow.storage_path as string, newPath, contentType: oldRow.mime_type as string })
      }
      if (table.name === 'requests' && (oldRow.attachment as { path?: string } | null)?.path) {
        const attachment = oldRow.attachment as { path: string; mime_type?: string }
        const newPath = `${newOrg.id}/${newId}/${basename(attachment.path)}`
        newRow.attachment = { ...attachment, path: newPath }
        filesToCopy.push({ bucket: 'request-attachments', oldPath: attachment.path, newPath, contentType: attachment.mime_type })
      }

      if (oldRow.id) map.set(oldRow.id as string, newId)
      newRows.push(newRow)
    }

    if (newRows.length) {
      const { error } = await supabaseAdmin.from(table.name).insert(newRows)
      if (error) throw new RestoreError(`Failed to restore ${table.name}: ${error.message}`)
    }
    idMaps[table.name] = map
    counts[table.name] = newRows.length
  }

  for (const file of filesToCopy) {
    const entry = zip.getEntry(`files/${file.bucket}/${file.oldPath}`)
    if (!entry) continue
    await supabaseAdmin.storage
      .from(file.bucket)
      .upload(file.newPath, entry.getData(), { contentType: file.contentType, upsert: true })
  }

  return { newOrgId: newOrg.id, newOrgSlug: newOrg.slug, counts, skippedUsers }
}
